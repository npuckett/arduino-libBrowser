/**
 * Data loader for the Arduino libraries catalog.
 *
 * Fetches the enriched `libraries.json` produced by the main project's pipeline
 * and served at https://thearduinolibrary.com/output/libraries.json. Caches it
 * in memory with a TTL that matches the hourly upstream sync cadence.
 *
 * Configurable via environment variables so the server is portable:
 *   ARDUINO_LIB_URL  — fetch from this URL instead of the live site
 *                      (e.g. http://localhost:8080/output/libraries.json)
 *   ARDUINO_LIB_FILE — load from this local file path instead of fetching
 *   ARDUINO_LIB_TTL  — cache TTL in seconds (default: 3600)
 */

import { readFile } from 'node:fs/promises';
import type { LibrariesIndex, Library } from './types.js';

const DEFAULT_URL = 'https://thearduinolibrary.com/output/libraries.json';
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

let cache: Library[] | null = null;
let cacheAt = 0;

function ttlMs(): number {
  const env = process.env.ARDUINO_LIB_TTL;
  const parsed = env ? Number(env) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : DEFAULT_TTL_MS;
}

function sourceUrl(): string {
  return process.env.ARDUINO_LIB_URL?.trim() || DEFAULT_URL;
}

function sourceFile(): string | null {
  return process.env.ARDUINO_LIB_FILE?.trim() || null;
}

/** Load the full catalog, using the in-memory cache when fresh. */
export async function loadLibraries(): Promise<Library[]> {
  const now = Date.now();
  if (cache && now - cacheAt < ttlMs()) {
    return cache;
  }

  const libs = await fetchFresh();
  cache = libs;
  cacheAt = now;
  return libs;
}

async function fetchFresh(): Promise<Library[]> {
  const file = sourceFile();
  if (file) {
    const raw = await readFile(file, 'utf8');
    return parse(raw, `file ${file}`);
  }

  const url = sourceUrl();
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to fetch libraries index (${res.status} ${res.statusText}) from ${url}`);
  }
  const raw = await res.text();
  return parse(raw, url);
}

function parse(raw: string, origin: string): Library[] {
  let parsed: LibrariesIndex;
  try {
    parsed = JSON.parse(raw) as LibrariesIndex;
  } catch (err) {
    throw new Error(`Could not parse libraries JSON from ${origin}: ${(err as Error).message}`);
  }
  const libs = parsed?.libraries;
  if (!Array.isArray(libs)) {
    throw new Error(`Libraries JSON from ${origin} has no 'libraries' array.`);
  }
  return libs;
}
