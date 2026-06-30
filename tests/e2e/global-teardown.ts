import { copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright global teardown: restore original data files that
 * global-setup.ts swapped out for the fixture.
 *
 * Idempotent — safe to run if setup didn't actually swap anything
 * (e.g. when reusing an existing server during local dev).
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

function joinRepo(...segments: string[]): string {
  return resolve(REPO_ROOT, ...segments);
}

export default async function globalTeardown() {
  try {
    const libsBak = joinRepo('output', 'libraries.json.bak');
    const libsTarget = joinRepo('output', 'libraries.json');
    if (existsSync(libsBak)) {
      await copyFile(libsBak, libsTarget);
      await rm(libsBak);
    }

    const picksFix = joinRepo('output', 'picks.json.fix');
    const picksTarget = joinRepo('output', 'picks.json');
    if (existsSync(picksFix)) {
      await copyFile(picksFix, picksTarget);
      await rm(picksFix);
    }
  } catch (err) {
    console.error('[e2e teardown] restore failed:', err);
  }
}
