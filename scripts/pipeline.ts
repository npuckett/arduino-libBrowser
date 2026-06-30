#!/usr/bin/env node
/**
 * arduino-libBrowser Pipeline CLI
 *
 * Usage:
 *   node --experimental-strip-types scripts/pipeline.ts <command> [flags]
 *
 * Commands:
 *   sync     Fetch the upstream Arduino library index and refresh output/libraries.json + changes.json.
 *   enrich   Refresh GitHub enrichment metadata (ETag-aware) for libraries missing or stale.
 *   stats    Compute trending scores and curated picks (output/stats.json, output/picks.json).
 *   all      Run sync -> enrich -> stats in sequence.
 *
 * Flags:
 *   --dry-run    Compute everything but write no files.
 *   --verbose    Debug-level logging.
 *   --full       (sync only) Re-enrich all libraries, not just new ones.
 *
 * Exit codes:
 *   0  success (including no-op runs)
 *   1  transient error — should be retried
 *   2  config error — should NOT be retried
 *
 * Idempotency:
 *   Running `sync` twice with no upstream changes is a no-op (ETag → 304).
 *   Running `enrich` with up-to-date ETags is a no-op (304 per repo).
 */

import { parseArgs } from 'node:util';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pino, type Logger } from 'pino';

import { fetchArduinoIndex, type ArduinoIndexFetchResult } from '../pipeline/src/sources/arduino-index.js';
import { enrichWithGithub, type GithubEnrichOptions, type GithubEnrichMetrics, type RepoEnrichmentCache, getGithubRepoName } from '../pipeline/src/sources/github-meta.js';
import { detectChanges, type DiffDetectorResult } from '../pipeline/src/transforms/diff-detector.js';
import { buildLibrariesJson, type LibrariesJsonOutput } from '../pipeline/src/output/build-libraries-json.js';
import { buildChangesJson, type BuildChangesJsonOptions } from '../pipeline/src/output/build-changes-json.js';
import { buildStatsJson } from '../pipeline/src/output/build-stats-json.js';
import { buildPicksJson } from '../pipeline/src/output/build-picks-json.js';
import { loadState, saveState, emptyState } from '../pipeline/src/utils/state.js';
import { computeDateSeed } from '../pipeline/src/transforms/daily-seed.js';
import { migrateLibraries, seedStateFromLibraries } from '../pipeline/src/transforms/v1-to-v2-migration.js';

import type {
  Library,
  SyncState,
  ChangesOutput,
  ArduinoIndexEntry,
} from '../pipeline/src/types.js';

const USAGE = 'Usage: pipeline.ts <sync|enrich|stats|all> [--dry-run] [--verbose] [--full]';
const EXIT_OK = 0;
const EXIT_RETRYABLE = 1;
const EXIT_CONFIG = 2;

const STATE_PATH = resolve('state/sync-state.json');
const LIBRARIES_PATH = resolve('output/libraries.json');
const CHANGES_PATH = resolve('output/changes.json');
const STATS_PATH = resolve('output/stats.json');
const PICKS_PATH = resolve('output/picks.json');

type Command = 'sync' | 'enrich' | 'stats' | 'all';

interface CliOptions {
  readonly command: Command;
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly full: boolean;
}

class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

class RetryableError extends Error {
  override readonly name = 'RetryableError';
}

function createLogger(verbose: boolean): Logger {
  const isTTY = Boolean(process.stdout.isTTY);
  return pino({
    name: 'pipeline',
    level: verbose ? 'debug' : 'info',
    base: { pid: process.pid },
    transport: isTTY
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        }
      : undefined,
  });
}

function parseCli(argv: readonly string[]): CliOptions {
  let parsed: ReturnType<typeof parseArgs>['values'];
  let positionals: ReturnType<typeof parseArgs>['positionals'];
  try {
    const result = parseArgs({
      args: argv as string[],
      options: {
        'dry-run': { type: 'boolean', default: false },
        verbose: { type: 'boolean', short: 'v', default: false },
        full: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    parsed = result.values;
    positionals = result.positionals;
  } catch (err) {
    throw new ConfigError(err instanceof Error ? err.message : String(err));
  }

  if (parsed.help || positionals.length === 0) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(EXIT_OK);
  }

  const command = positionals[0];
  if (
    command !== 'sync' &&
    command !== 'enrich' &&
    command !== 'stats' &&
    command !== 'all'
  ) {
    throw new ConfigError(`unknown command: ${String(command)}`);
  }

  return {
    command,
    dryRun: Boolean(parsed['dry-run']),
    verbose: Boolean(parsed.verbose),
    full: Boolean(parsed.full),
  };
}

type Cleanup = () => void;

function installSignalHandlers(logger: Logger): Cleanup {
  let signaled = false;
  const handler = (signal: NodeJS.Signals): void => {
    if (signaled) return;
    signaled = true;
    logger.warn({ signal }, 'received signal, exiting gracefully');
    process.exit(130);
  };
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  return (): void => {
    process.off('SIGINT', handler);
    process.off('SIGTERM', handler);
  };
}

async function readJsonFile<T>(path: string): Promise<T> {
  const abs = resolve(path);
  const raw = await readFile(abs, 'utf-8');
  return JSON.parse(raw) as T;
}

async function writeJsonFile(path: string, data: unknown): Promise<void> {
  const abs = resolve(path);
  await mkdir(dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmp, abs);
}

interface LibrariesFile {
  libraries?: unknown;
  enhanced_at?: unknown;
}

async function readPreviousLibraries(): Promise<Library[]> {
  try {
    const raw = await readJsonFile<LibrariesFile>(LIBRARIES_PATH);
    if (!raw || !Array.isArray(raw.libraries)) return [];
    return migrateLibraries(raw.libraries);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function loadLibrariesOrFail(logger: Logger): Promise<Library[]> {
  const libs = await readPreviousLibraries();
  if (libs.length === 0) {
    logger.warn('no libraries.json found; run `sync` first');
    throw new ConfigError('no libraries.json; run `sync` first');
  }
  return libs;
}

function applyEnrichment(
  lib: Library,
  enriched: { stars: number; forks: number; language: string; updated_at: string; topics: string[] } | null
): Library {
  if (!enriched) return lib;
  return {
    ...lib,
    github_stars: enriched.stars,
    github_forks: enriched.forks,
    github_language: enriched.language,
    github_updated_at: enriched.updated_at,
  };
}

async function enrichTargets(
  releases: ArduinoIndexEntry[],
  state: SyncState,
  cache: RepoEnrichmentCache,
  token: string | undefined,
  logger: Logger,
  options: { dryRun?: boolean } = {}
): Promise<{ apiCalls: number; rateLimitHits: number; skipped: number }> {
  const metrics: GithubEnrichMetrics = {
    apiCalls: 0,
    rateLimitHits: 0,
    notFound: 0,
    unchanged: 0,
    updated: 0,
  };
  const opts: GithubEnrichOptions = {
    token,
    delayMs: options.dryRun ? 0 : 1000,
    maxRetries: 3,
  };

  let skipped = 0;
  for (const release of releases) {
    if (options.dryRun) {
      skipped += 1;
      continue;
    }
    try {
      await enrichWithGithub(release, state, cache, opts, metrics);
    } catch (err) {
      logger.warn(
        { repo: getGithubRepoName(release), err: (err as Error).message },
        'enrich failed; continuing'
      );
    }
  }
  return { apiCalls: metrics.apiCalls, rateLimitHits: metrics.rateLimitHits, skipped };
}

async function runSync(opts: CliOptions, logger: Logger): Promise<void> {
  logger.info('sync: loading state');
  const state = await loadState(STATE_PATH);

  logger.info('sync: fetching upstream library index');
  let result: ArduinoIndexFetchResult;
  try {
    result = await fetchArduinoIndex(state);
  } catch (err) {
    throw new RetryableError(`upstream fetch failed: ${(err as Error).message}`);
  }

  if (result.status === 'unchanged') {
    logger.info(
      { etag: state.lastEtag },
      'sync: index unchanged (304); nothing to do'
    );
    return;
  }

  logger.info(
    { releases: result.releases.length, etag: state.lastEtag },
    'sync: upstream index updated'
  );

  const previous = await readPreviousLibraries();
  seedStateFromLibraries(state, previous);
  const changes: DiffDetectorResult = detectChanges(previous, result.releases, state);
  logger.info(
    {
      new: changes.newLibs.length,
      updated: changes.updatedLibs.length,
      removed: changes.removed.length,
    },
    'sync: changes detected'
  );

  const cache: RepoEnrichmentCache = {};
  const targets = opts.full ? result.releases : changes.newLibs.map((lib) => {
    return result.releases.find((r) => {
      const repoName = getGithubRepoName(r);
      return repoName === lib.repository_name;
    });
  }).filter((r): r is ArduinoIndexEntry => Boolean(r));

  const uniqueTargets = Array.from(
    new Map(targets.map((r) => [getGithubRepoName(r) ?? '', r])).values()
  );

  if (uniqueTargets.length > 0) {
    logger.info({ count: uniqueTargets.length }, 'sync: enriching with GitHub');
    const { apiCalls, rateLimitHits, skipped } = await enrichTargets(
      uniqueTargets,
      state,
      cache,
      process.env['GITHUB_TOKEN'],
      logger,
      { dryRun: opts.dryRun }
    );
    if (opts.dryRun) {
      logger.info({ skipped }, 'sync: dry-run; skipped GitHub calls');
    }
    logger.info(
      { apiCalls, rateLimitHits },
      'sync: GitHub enrichment complete'
    );
  } else {
    logger.info('sync: no enrichment candidates');
  }

  for (const lib of changes.newLibs) {
    const cached = cache[lib.repository_name];
    if (cached) Object.assign(lib, applyEnrichment(lib, cached));
  }
  for (const lib of changes.updatedLibs) {
    const cached = cache[lib.repository_name];
    if (cached) Object.assign(lib, applyEnrichment(lib, cached));
  }

  // V1.5 → V2 migration safety net: the migrated last_seen_sha won't match
  // the upstream's sha on the first run, so the diff-detector marks many
  // existing libs as "updated". Those libs are reconstructed from the
  // upstream release (which carries no github_* fields) and would lose the
  // V1.5 enrichment. Fall back to the previous library's enrichment if
  // we don't have a fresh cache entry — the V1.5 enrichment is recent and
  // good enough until the next daily enrich run refreshes it.
  const previousByRepo = new Map<string, Library>();
  for (const lib of previous) {
    if (typeof lib.repository_name === 'string' && lib.repository_name.length > 0) {
      previousByRepo.set(lib.repository_name, lib);
    }
  }
  for (const lib of [...changes.newLibs, ...changes.updatedLibs]) {
    if (typeof lib.github_stars === 'number') continue;
    const prev = previousByRepo.get(lib.repository_name);
    if (!prev || typeof prev.github_stars !== 'number') continue;
    lib.github_stars = prev.github_stars;
    lib.github_forks = prev.github_forks;
    lib.github_language = prev.github_language;
    lib.github_updated_at = prev.github_updated_at;
  }

  const allLibs: Library[] = [...previous];
  const touchedRepoNames = new Set([
    ...changes.newLibs.map((l) => l.repository_name),
    ...changes.updatedLibs.map((l) => l.repository_name),
    ...changes.removed,
  ]);
  const kept = allLibs.filter((l) => !touchedRepoNames.has(l.repository_name));
  const finalLibs = [
    ...kept,
    ...changes.newLibs,
    ...changes.updatedLibs,
  ];

  if (opts.dryRun) {
    logger.info(
      {
        wouldWrite: finalLibs.length,
        new: changes.newLibs.length,
        updated: changes.updatedLibs.length,
        removed: changes.removed.length,
      },
      'sync: dry-run, not writing files'
    );
    return;
  }

  const out: LibrariesJsonOutput = buildLibrariesJson(finalLibs, { state });
  await writeJsonFile(LIBRARIES_PATH, out);

  const previousEtag = state.lastHighWaterMark ?? new Date(0).toISOString();
  const changesOut: ChangesOutput = buildChangesJson(
    changes.newLibs,
    changes.updatedLibs,
    changes.removed,
    previousEtag,
    {} as BuildChangesJsonOptions
  );
  await writeJsonFile(CHANGES_PATH, changesOut);

  await saveState(state, STATE_PATH);
  logger.info(
    {
      total: out.total_libraries,
      new: changes.newLibs.length,
      updated: changes.updatedLibs.length,
    },
    'sync: complete'
  );
}

async function runEnrich(opts: CliOptions, logger: Logger): Promise<void> {
  logger.info('enrich: loading libraries and state');
  const state = await loadState(STATE_PATH);
  const libraries = await loadLibrariesOrFail(logger);

  const cache: RepoEnrichmentCache = {};
  for (const lib of libraries) {
    if (typeof lib.github_stars === 'number' && lib.github_language !== undefined) {
      cache[lib.repository_name] = {
        stars: lib.github_stars,
        forks: lib.github_forks ?? 0,
        language: lib.github_language,
        updated_at: lib.github_updated_at ?? '',
        topics: [],
      };
    }
  }

  const targets: ArduinoIndexEntry[] = [];
  for (const lib of libraries) {
    if (lib.github_stars === undefined || lib.github_language === undefined) {
      targets.push({
        name: lib.name,
        version: lib.version,
        author: lib.author,
        maintainer: lib.maintainer,
        sentence: lib.sentence,
        paragraph: lib.paragraph,
        category: lib.category,
        architectures: lib.architectures,
        types: [],
        repository: lib.repository_url,
        url: lib.download_url ?? '',
        archiveFileName: '',
        size: lib.size ?? 0,
        checksum: '',
        license: lib.license ?? '',
        dependencies: lib.depends ?? [],
        providesIncludes: [],
      });
    }
  }

  logger.info(
    { total: libraries.length, refresh: targets.length },
    'enrich: candidates identified'
  );

  if (targets.length === 0) {
    logger.info('enrich: nothing to refresh');
    return;
  }

  const { apiCalls, skipped } = await enrichTargets(
    targets,
    state,
    cache,
    process.env['GITHUB_TOKEN'],
    logger,
    { dryRun: opts.dryRun }
  );
  if (opts.dryRun) {
    logger.info({ skipped, total: targets.length }, 'enrich: dry-run; skipped GitHub calls');
  } else {
    logger.info({ apiCalls }, 'enrich: GitHub fetch complete');
  }

  const refreshed = libraries.map((lib) => {
    const cached = cache[lib.repository_name];
    if (!cached) return lib;
    return {
      ...lib,
      github_stars: cached.stars,
      github_forks: cached.forks,
      github_language: cached.language,
      github_updated_at: cached.updated_at,
    };
  });

  if (opts.dryRun) {
    logger.info({ wouldWrite: refreshed.length }, 'enrich: dry-run, not writing');
    return;
  }

  const out = buildLibrariesJson(refreshed, { state });
  await writeJsonFile(LIBRARIES_PATH, out);
  await saveState(state, STATE_PATH);
  logger.info({ written: refreshed.length }, 'enrich: complete');
}

async function runStats(opts: CliOptions, logger: Logger): Promise<void> {
  logger.info('stats: loading libraries');
  const libraries = await loadLibrariesOrFail(logger);
  const state = await loadState(STATE_PATH);

  const trendingScores: Record<string, number> = {};
  for (const lib of libraries) {
    if (typeof lib.github_stars === 'number') {
      trendingScores[lib.repository_name] = lib.github_stars;
    }
  }

  const stats = buildStatsJson(libraries, trendingScores);
  logger.info(
    {
      total: libraries.length,
      trending: stats.trending.length,
      hiddenGems: stats.hidden_gems.length,
      categories: Object.keys(stats.categories).length,
    },
    'stats: computed'
  );

  if (opts.dryRun) {
    logger.info('stats: dry-run, not writing');
    return;
  }

  await writeJsonFile(STATS_PATH, stats);

  const changesFile = await readJsonFile<ChangesOutput>(CHANGES_PATH).catch(() => null);
  const changes: ChangesOutput = changesFile ?? {
    since: '',
    new_libraries: [],
    updated_libraries: [],
    removed_libraries: [],
  };

  const picks = buildPicksJson(
    libraries,
    resolve('editors.json'),
    resolve('themes.json'),
    changes,
    { trendingScores }
  );
  await writeJsonFile(PICKS_PATH, picks);
  logger.info(
    {
      editors: picks.editors.length,
      themes: Object.keys(picks.themes).length,
      newThisWeek: picks.computed.new_this_week.length,
    },
    'stats: complete'
  );

  void computeDateSeed;
  void emptyState;
}

async function main(): Promise<void> {
  let opts: CliOptions;
  try {
    opts = parseCli(process.argv.slice(2));
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`config error: ${err.message}\n${USAGE}\n`);
      process.exit(EXIT_CONFIG);
    }
    throw err;
  }

  const logger = createLogger(opts.verbose);
  const uninstall = installSignalHandlers(logger);

  logger.info(
    { command: opts.command, dryRun: opts.dryRun, full: opts.full },
    'pipeline starting'
  );

  try {
    switch (opts.command) {
      case 'sync':
        await runSync(opts, logger);
        break;
      case 'enrich':
        await runEnrich(opts, logger);
        break;
      case 'stats':
        await runStats(opts, logger);
        break;
      case 'all':
        await runSync(opts, logger);
        await runEnrich(opts, logger);
        await runStats(opts, logger);
        break;
    }
    logger.info({ command: opts.command }, 'pipeline complete');
    uninstall();
    process.exit(EXIT_OK);
  } catch (err) {
    uninstall();
    if (err instanceof ConfigError) {
      logger.error({ err: err.message }, 'config error');
      process.exit(EXIT_CONFIG);
    }
    if (err instanceof RetryableError) {
      logger.error({ err: err.message }, 'transient error');
      process.exit(EXIT_RETRYABLE);
    }
    logger.error({ err }, 'unexpected error');
    process.exit(EXIT_RETRYABLE);
  }
}

await main();
