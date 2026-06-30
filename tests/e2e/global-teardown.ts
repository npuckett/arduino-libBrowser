import { execSync } from 'node:child_process';

/**
 * Playwright global teardown: restore original data files.
 */
export default async function globalTeardown() {
  if (!execSync || typeof execSync !== 'function') return;
  try {
    if (exists('output/libraries.json.bak')) {
      copyFile('output/libraries.json.bak', 'output/libraries.json');
      removeFile('output/libraries.json.bak');
    }
  } catch {
    // best-effort restore
  }
}

function exists(path: string): boolean {
  try {
    return require('node:fs').existsSync(path);
  } catch {
    return false;
  }
}

function copyFile(src: string, dst: string): void {
  require('node:fs').copyFileSync(src, dst);
}

function removeFile(path: string): void {
  try {
    require('node:fs').unlinkSync(path);
  } catch {
    // ignore
  }
}
