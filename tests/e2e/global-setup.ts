import { execSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Playwright global setup: overwrite the live data files with our fixtures.
 *
 * Why: the live libraries.json is 14.9MB and the schema differs (v1 vs v2).
 * Tests need a stable, small dataset. We swap in fixtures before the server
 * starts, then restore the originals after.
 */
export default async function globalSetup() {
  if (!existsSync('output/libraries.json')) {
    return;
  }
  await mkdir('tests/e2e/.backups', { recursive: true });
  await execShell('cp output/libraries.json tests/e2e/.backups/libraries.original.json');
  await execShell('cp output/libraries.json output/libraries.json.bak');
  await execShell('cp input/repositories.txt tests/e2e/.backups/repositories.original.txt 2>/dev/null || true');

  await copyFile('tests/e2e/fixtures/libraries.v2.json', 'output/libraries.json');
  await copyFile('tests/e2e/fixtures/picks.json', 'output/picks.json');
}

function execShell(cmd: string): Promise<void> {
  return new Promise<void>((resolveFn, reject) => {
    try {
      execSync(cmd, { stdio: 'pipe' });
      resolveFn();
    } catch (err) {
      reject(err as Error);
    }
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __PLAYWRIGHT_FIXTURE_INSTALLED__: boolean | undefined;
}
