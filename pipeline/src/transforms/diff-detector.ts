import type {
  ArduinoIndexEntry,
  Library,
  SyncState,
  VersionHistoryEntry,
} from '../types.js';
import { sha256Short } from '../utils/hash.js';

export interface DiffDetectorResult {
  newLibs: Library[];
  updatedLibs: Library[];
  removed: string[];
}

export interface DiffDetectorOptions {
  now?: Date;
}

function deriveRepoName(release: ArduinoIndexEntry): string | null {
  const repo = release.repository;
  if (!repo) return null;
  let url = repo.trim();
  url = url.replace(/^https?:\/\//i, '');
  url = url.replace(/^github\.com\//i, '');
  url = url.replace(/\.git$/i, '');
  url = url.replace(/\/+$/, '');
  return url || null;
}

function deriveRepositoryUrl(repoName: string, original: string): string {
  if (original && /^https?:\/\//i.test(original)) {
    return original.replace(/\.git$/i, '');
  }
  return `https://github.com/${repoName}`;
}

function parseArchitectures(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((a) => a.trim()).filter((a) => a.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
  }
  return [];
}

function parseDependencies(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  // Real Arduino index: dependencies is an array of objects with {name, version?, ...}.
  // Older fixtures may use string[] or a comma-separated string.
  if (Array.isArray(value)) {
    const list = value
      .map((d) => {
        if (typeof d === 'string') return d.trim();
        if (d && typeof d === 'object' && typeof d['name'] === 'string') {
          return (d['name'] as string).trim();
        }
        return '';
      })
      .filter((d) => d.length > 0);
    return list.length > 0 ? list : undefined;
  }
  if (typeof value === 'string') {
    const list = value
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    return list.length > 0 ? list : undefined;
  }
  return undefined;
}

export function releaseToLibrary(
  release: ArduinoIndexEntry,
  state: SyncState,
  now: Date
): Library | null {
  const repoName = deriveRepoName(release);
  if (!repoName) {
    return null;
  }

  const sha = sha256Short(`${release.archiveFileName}|${release.version}`);
  const nowIso = now.toISOString();
  const history: VersionHistoryEntry[] = state.versionHistory[repoName] ?? [];
  const releaseCount = history.length > 0 ? history.length : 1;

  const lib: Library = {
    repository_name: repoName,
    repository_url: deriveRepositoryUrl(repoName, release.repository),
    name: release.name,
    version: release.version,
    version_history: history,
    release_count: releaseCount,
    first_seen_at: state.firstSeenAt[repoName] ?? nowIso,
    last_seen_sha: sha,
    author: release.author,
    maintainer: release.maintainer,
    sentence: release.sentence,
    paragraph: release.paragraph,
    category: release.category,
    architectures: parseArchitectures(release.architectures),
    license: release.license || undefined,
    depends: parseDependencies(release.dependencies),
    download_url: release.url || undefined,
    size: typeof release.size === 'number' ? release.size : undefined,
  };

  const previousVersion = state.previousVersion[repoName];
  if (previousVersion && previousVersion !== release.version) {
    lib.previous_version = previousVersion;
  }

  return lib;
}

export function detectChanges(
  oldLibs: Library[],
  newReleases: ArduinoIndexEntry[],
  state: SyncState,
  options: DiffDetectorOptions = {}
): DiffDetectorResult {
  const now = options.now ?? new Date();
  const newLibs: Library[] = [];
  const updatedLibs: Library[] = [];
  const seenRepoNames = new Set<string>();
  const oldLibsByRepo = new Map<string, Library>();
  for (const lib of oldLibs) {
    oldLibsByRepo.set(lib.repository_name, lib);
  }

  // The Arduino library index contains 1+ release per repository (every
  // tagged version in the registry). We need ONE Library per repository
  // (the latest version), so group releases by repo name first.
  const latestByRepo = new Map<string, ArduinoIndexEntry>();
  for (const release of newReleases) {
    const repoName = deriveRepoName(release);
    if (!repoName) continue;
    const existing = latestByRepo.get(repoName);
    if (!existing || compareVersions(release.version, existing.version) > 0) {
      latestByRepo.set(repoName, release);
    }
  }

  for (const [repoName, release] of latestByRepo) {
    seenRepoNames.add(repoName);

    const sha = sha256Short(`${release.archiveFileName}|${release.version}`);
    const previousSha = state.lastSeenSha[repoName];
    const knownFirstSeen = state.firstSeenAt[repoName];

    const existing = oldLibsByRepo.get(repoName);

    if (!knownFirstSeen) {
      const nowIso = now.toISOString();
      state.firstSeenAt[repoName] = nowIso;
      state.lastSeenSha[repoName] = sha;
      state.previousVersion[repoName] = release.version;
      state.versionHistory[repoName] = [
        { version: release.version, seen_at: nowIso },
      ];

      const lib = releaseToLibrary(release, state, now);
      if (lib) {
        newLibs.push(lib);
      }
      continue;
    }

    if (previousSha === sha) {
      continue;
    }

    const nowIso = now.toISOString();
    const history = state.versionHistory[repoName] ?? [];
    history.push({ version: release.version, seen_at: nowIso });
    state.versionHistory[repoName] = history;

    const oldVersion = state.previousVersion[repoName] ?? existing?.version ?? '';
    state.previousVersion[repoName] = release.version;
    state.lastSeenSha[repoName] = sha;

    const lib = releaseToLibrary(release, state, now);
    if (!lib) {
      continue;
    }
    lib.previous_version = oldVersion || undefined;
    lib.version_history = history;
    lib.release_count = history.length;

    updatedLibs.push(lib);
  }

  const removed: string[] = [];
  for (const lib of oldLibs) {
    if (!seenRepoNames.has(lib.repository_name)) {
      removed.push(lib.repository_name);
    }
  }

  state.knownLibraryCount = seenRepoNames.size;
  state.lastHighWaterMark = now.toISOString();

  return { newLibs, updatedLibs, removed };
}

// Loose semver-ish compare. Returns >0 if a > b, <0 if a < b, 0 if equal.
// Handles "1.2.3", "1.2", "2.0.0-rc1", "precompiled:" (returns 0 on unparsable).
function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

function parseVersion(v: string): [number, number, number] {
  if (!v || typeof v !== 'string') return [0, 0, 0];
  const cleaned = v.replace(/^v/i, '').split('-')[0] ?? '';
  const parts = cleaned.split('.').map((n) => {
    const num = Number.parseInt(n, 10);
    return Number.isFinite(num) ? num : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}