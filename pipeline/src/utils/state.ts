import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { SyncState } from '../types.js';

export function emptyState(): SyncState {
  return {
    repoEtags: {},
    knownLibraryCount: 0,
    firstSeenAt: {},
    lastSeenSha: {},
    previousVersion: {},
    versionHistory: {},
  };
}

export async function loadState(path: string): Promise<SyncState> {
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    return {
      ...emptyState(),
      ...parsed,
      repoEtags: parsed.repoEtags ?? {},
      firstSeenAt: parsed.firstSeenAt ?? {},
      lastSeenSha: parsed.lastSeenSha ?? {},
      previousVersion: parsed.previousVersion ?? {},
      versionHistory: parsed.versionHistory ?? {},
      knownLibraryCount: parsed.knownLibraryCount ?? 0,
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return emptyState();
    }
    throw err;
  }
}

export async function saveState(
  state: SyncState,
  path: string
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  const json = JSON.stringify(state, null, 2);
  await writeFile(tmpPath, json, 'utf-8');
  await rename(tmpPath, path);
}