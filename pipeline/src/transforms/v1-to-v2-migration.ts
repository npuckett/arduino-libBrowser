import type { Library, SyncState, VersionHistoryEntry } from '../types.js';
import { sha256Short } from '../utils/hash.js';

/**
 * V1.5 libraries.json schema (the old production format):
 *
 *   {
 *     "enhanced_at": "2026-06-30T09:02:43Z",
 *     "total_libraries": 9524,
 *     "changes_in_last_update": { ... },
 *     "libraries": [
 *       {
 *         "name": "...",
 *         "version": "1.0.0",
 *         "repository_name": "owner/repo",
 *         "repository_url": "https://github.com/owner/repo",
 *         "author": "...",
 *         "maintainer": "...",
 *         "category": "Sensors",
 *         "architectures": "avr,esp32",         // STRING (comma-separated)
 *         "depends": "Wire,SPI (>=1.0)",        // STRING (comma-separated, may have version)
 *         "github_stars": 42,                   // (optional)
 *         "github_forks": 5,
 *         "github_language": "C++",
 *         "github_updated_at": "2024-01-01T00:00:00Z",
 *         "processed_at": "2025-07-21T16:26:35Z",
 *         "enhanced_at": "2025-07-23T00:35:27Z",
 *         "url": "https://github.com/owner/repo",
 *         "license": "MIT",
 *         "size": 12345,
 *         ... legacy fields: precompiled, dot_a_linkage, includes, properties, etc.
 *       },
 *       ...
 *     ]
 *   }
 *
 * V2 libraries.json schema:
 *   { version: 2, enhanced_at, total_libraries, index_etag, index_last_modified,
 *     libraries: [Library, ...], stats: {...} }
 *   where Library has: first_seen_at, last_seen_sha, version_history, release_count,
 *     architectures: string[], depends: string[], etc.
 */

interface V15Library {
  name?: unknown;
  version?: unknown;
  repository_name?: unknown;
  repository_url?: unknown;
  author?: unknown;
  maintainer?: unknown;
  sentence?: unknown;
  paragraph?: unknown;
  category?: unknown;
  architectures?: unknown;
  depends?: unknown;
  github_stars?: unknown;
  github_forks?: unknown;
  github_language?: unknown;
  github_updated_at?: unknown;
  license?: unknown;
  processed_at?: unknown;
  enhanced_at?: unknown;
  enhancement_date?: unknown;
  url?: unknown;
  size?: unknown;
}

const DEPENDENCY_VERSION_RE = /\s*\(.*?\)\s*/;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asIsoString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return undefined;
  // Preserve the original timestamp string when it's already a valid ISO
  // 8601 (with or without milliseconds, with or without trailing Z).
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.test(value)) {
    return value.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  }
  return new Date(ms).toISOString();
}

function pickFirstSeenAt(lib: V15Library, nowIso: string): string {
  return (
    asIsoString(lib.processed_at) ??
    asIsoString(lib.enhanced_at) ??
    asIsoString(lib.enhancement_date) ??
    nowIso
  );
}

function splitArchitectures(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((a) => (typeof a === 'string' ? a.trim() : ''))
      .filter((a) => a.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
  }
  return [];
}

function splitDependencySpec(spec: string): string {
  return spec.split(DEPENDENCY_VERSION_RE)[0]?.trim() ?? '';
}

function splitDepends(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const list = value
      .map((d) => {
        if (typeof d === 'string') return splitDependencySpec(d);
        if (d && typeof d === 'object') {
          const name = (d as { name?: unknown }).name;
          if (typeof name === 'string') return splitDependencySpec(name);
        }
        return '';
      })
      .filter((d) => d.length > 0);
    return list.length > 0 ? list : undefined;
  }
  if (typeof value === 'string') {
    if (value.trim().length === 0) return undefined;
    const list = value
      .split(',')
      .map(splitDependencySpec)
      .filter((d) => d.length > 0);
    return list.length > 0 ? list : undefined;
  }
  return undefined;
}

function deriveArchiveFileName(name: string, version: string): string {
  const safeName = name.length > 0 ? name : 'unknown';
  const safeVersion = version.length > 0 ? version : '0.0.0';
  return `${safeName}-${safeVersion}.zip`;
}

/**
 * Detect whether a raw library object looks like the old V1.5 schema (i.e. is
 * missing fields that V2 requires). Used to decide whether a migration pass
 * is needed.
 */
export function isV15Library(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const lib = raw as Record<string, unknown>;
  const hasV2Fields =
    'first_seen_at' in lib ||
    'last_seen_sha' in lib ||
    'version_history' in lib ||
    'release_count' in lib;
  if (hasV2Fields) return false;
  // V1.5 was the production format before V2 — if it has any of the V1.5
  // quirks (string architectures, string depends) or simply lacks V2 fields,
  // we treat it as V1.5.
  const arch = lib['architectures'];
  const deps = lib['depends'];
  if (typeof arch === 'string') return true;
  if (typeof deps === 'string') return true;
  if (!hasV2Fields && typeof lib['name'] === 'string') return true;
  return false;
}

/**
 * Convert one V1.5-shaped library record into a V2 Library.
 * If the input is already V2 (i.e. has `first_seen_at`), it is returned
 * unchanged. Defensive defaults are used for any missing fields.
 */
export function migrateLibrary(raw: unknown, now: Date = new Date()): Library {
  const lib = (raw ?? {}) as V15Library;
  const nowIso = now.toISOString();
  const name = asString(lib.name);
  const version = asString(lib.version);
  const repoName =
    asString(lib.repository_name) ||
    (() => {
      const url = asString(lib.repository_url);
      if (!url) return '';
      const m = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
      return m?.[1] ?? '';
    })();

  const firstSeenAt = pickFirstSeenAt(lib, nowIso);
  const archiveFileName = deriveArchiveFileName(name, version);
  const lastSeenSha = sha256Short(`${archiveFileName}|${version}`);

  const history: VersionHistoryEntry[] = version
    ? [{ version, seen_at: firstSeenAt }]
    : [];

  const architectures = splitArchitectures(lib.architectures);
  const depends = splitDepends(lib.depends);

  const migrated: Library = {
    repository_name: repoName,
    repository_url: asString(lib.repository_url),
    name,
    version,
    version_history: history,
    release_count: history.length,
    first_seen_at: firstSeenAt,
    last_seen_sha: lastSeenSha,
    author: asString(lib.author),
    maintainer: asString(lib.maintainer),
    sentence: asString(lib.sentence),
    paragraph: asString(lib.paragraph),
    category: asString(lib.category),
    architectures,
    github_stars: asOptionalNumber(lib.github_stars),
    github_forks: asOptionalNumber(lib.github_forks),
    github_language: asOptionalString(lib.github_language),
    github_updated_at: asOptionalString(lib.github_updated_at),
    license: asOptionalString(lib.license),
    depends,
    download_url: asOptionalString(lib.url),
    size: asOptionalNumber(lib.size),
  };

  return migrated;
}

/**
 * Convert an array of V1.5/V2-mixed libraries into a clean V2 array.
 * Libraries that are already V2 are passed through unchanged.
 */
export function migrateLibraries(
  raws: readonly unknown[],
  now: Date = new Date()
): Library[] {
  const out: Library[] = [];
  for (const raw of raws) {
    if (!isV15Library(raw)) {
      // Already V2 or close enough — trust it.
      out.push(raw as Library);
      continue;
    }
    out.push(migrateLibrary(raw, now));
  }
  return out;
}

export interface V15LibrariesFile {
  enhanced_at?: unknown;
  total_libraries?: unknown;
  libraries?: unknown;
}

/**
 * Read the top-level V1.5 wrapper. Returns the inner libraries array (or []
 * if the file is empty/invalid) and a fallback `enhanced_at` to use when
 * the file did not specify one.
 */
export function readV15File(
  raw: unknown,
  now: Date = new Date()
): { libraries: Library[]; enhancedAtFallback: string } {
  const file = (raw ?? {}) as V15LibrariesFile;
  const raws = Array.isArray(file.libraries) ? file.libraries : [];
  const libraries = migrateLibraries(raws, now);
  const fallback = asIsoString(file.enhanced_at) ?? now.toISOString();
  return { libraries, enhancedAtFallback: fallback };
}

/**
 * Seed a SyncState from an array of (already-migrated) libraries so that the
 * diff-detector recognises them as known on the next run. This is necessary
 * when migrating from V1.5 because the old state file (if any) does not
 * contain the V2 fields (firstSeenAt, lastSeenSha, etc.).
 *
 * Only fills fields that are missing — never overwrites newer state.
 */
export function seedStateFromLibraries(
  state: SyncState,
  libraries: readonly Library[]
): void {
  for (const lib of libraries) {
    if (typeof lib.repository_name !== 'string' || lib.repository_name.length === 0) {
      continue;
    }
    if (!state.firstSeenAt[lib.repository_name] && typeof lib.first_seen_at === 'string') {
      state.firstSeenAt[lib.repository_name] = lib.first_seen_at;
    }
    if (!state.lastSeenSha[lib.repository_name] && typeof lib.last_seen_sha === 'string') {
      state.lastSeenSha[lib.repository_name] = lib.last_seen_sha;
    }
    if (!state.previousVersion[lib.repository_name] && typeof lib.version === 'string') {
      state.previousVersion[lib.repository_name] = lib.version;
    }
    if (
      !state.versionHistory[lib.repository_name] &&
      Array.isArray(lib.version_history) &&
      lib.version_history.length > 0
    ) {
      state.versionHistory[lib.repository_name] = lib.version_history.map((h) => ({
        version: h.version,
        seen_at: h.seen_at,
      }));
    }
  }
  state.knownLibraryCount = libraries.length;
}