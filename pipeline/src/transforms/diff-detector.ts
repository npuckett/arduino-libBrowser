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

function parseDependencies(
  value: string | string[] | undefined
): string[] | undefined {
  if (Array.isArray(value)) {
    const list = value
      .map((d) => d.trim())
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

  for (const release of newReleases) {
    const repoName = deriveRepoName(release);
    if (!repoName) {
      continue;
    }
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

  state.knownLibraryCount = oldLibsByRepo.size + newLibs.length - removed.length;
  state.lastHighWaterMark = now.toISOString();

  return { newLibs, updatedLibs, removed };
}