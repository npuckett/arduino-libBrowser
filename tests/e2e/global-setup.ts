import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright global setup: overwrite the live data files with our fixtures.
 *
 * Why: the live libraries.json is 14.9MB and the schema differs (v1 vs v2).
 * Tests need a stable, small dataset. We swap in fixtures before the server
 * starts, then restore the originals in global-teardown.ts.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

function joinRepo(...segments: string[]): string {
  return resolve(REPO_ROOT, ...segments);
}

export default async function globalSetup() {
  const realLibs = joinRepo('output', 'libraries.json');
  if (!existsSync(realLibs)) {
    return;
  }

  // Back up the real files (we'll restore in teardown).
  // We use a `.bak` suffix for libraries.json (the common convention)
  // and a `.fix` suffix for picks.json (avoid colliding with the
  // legacy `.bak`-based restore path).
  await mkdir(joinRepo('tests', 'e2e', '.backups'), { recursive: true });
  await copyFile(realLibs, joinRepo('output', 'libraries.json.bak'));
  await copyFile(realLibs, joinRepo('tests', 'e2e', '.backups', 'libraries.original.json'));

  const realPicks = joinRepo('output', 'picks.json');
  if (existsSync(realPicks)) {
    await copyFile(realPicks, joinRepo('output', 'picks.json.fix'));
    await copyFile(realPicks, joinRepo('tests', 'e2e', '.backups', 'picks.original.json'));
  }

  await copyFile(
    joinRepo('input', 'repositories.txt'),
    joinRepo('tests', 'e2e', '.backups', 'repositories.original.txt')
  ).catch(() => {
    // repositories.txt may not exist locally
  });

  // Swap in the fixtures.
  await copyFile(joinRepo('tests', 'e2e', 'fixtures', 'libraries.v2.json'), realLibs);
  await copyFile(joinRepo('tests', 'e2e', 'fixtures', 'picks.json'), realPicks);
}
