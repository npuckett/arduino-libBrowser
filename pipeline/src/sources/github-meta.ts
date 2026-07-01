import { conditionalGet } from '../utils/http.js';
import { sleep } from '../utils/sleep.js';
import type {
  ArduinoIndexEntry,
  EnrichedFields,
  GitHubRepoMetadata,
  SyncState,
} from '../types.js';

export interface GithubEnrichOptions {
  token?: string;
  onlyMissing?: boolean;
  delayMs?: number;
  maxRetries?: number;
}

export interface RepoEnrichmentCache {
  [repoName: string]: GitHubRepoMetadata | null;
}

export interface GithubEnrichMetrics {
  apiCalls: number;
  rateLimitHits: number;
  notFound: number;
  unchanged: number;
  updated: number;
}

const GITHUB_API = 'https://api.github.com';

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

function parseRateLimitReset(headers: Record<string, string>): number {
  const reset = headers['x-ratelimit-reset'];
  if (!reset) {
    return Date.now() / 1000 + 60;
  }
  const seconds = Number.parseInt(reset, 10);
  if (!Number.isFinite(seconds)) {
    return Date.now() / 1000 + 60;
  }
  return seconds;
}

function isRateLimitResponse(
  status: number,
  headers: Record<string, string>
): boolean {
  if (status === 403) {
    const remaining = headers['x-ratelimit-remaining'];
    return remaining === '0';
  }
  if (status === 429) {
    return true;
  }
  return false;
}

export function getGithubRepoName(
  release: ArduinoIndexEntry
): string | null {
  return deriveRepoName(release);
}

export async function enrichWithGithub(
  release: ArduinoIndexEntry,
  state: SyncState,
  cache: RepoEnrichmentCache,
  options: GithubEnrichOptions = {},
  metrics: GithubEnrichMetrics = {
    apiCalls: 0,
    rateLimitHits: 0,
    notFound: 0,
    unchanged: 0,
    updated: 0,
  }
): Promise<EnrichedFields> {
  const repoName = deriveRepoName(release);
  if (!repoName) {
    return null;
  }

  if (options.onlyMissing && cache[repoName]) {
    return cache[repoName] ?? null;
  }

  const delayMs = options.delayMs ?? 1000;
  const maxRetries = options.maxRetries ?? 3;
  const url = `${GITHUB_API}/repos/${repoName}`;
  const etag = state.repoEtags[repoName];

  if (delayMs > 0) {
    await sleep(delayMs);
  }

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    metrics.apiCalls += 1;

    const result = await conditionalGet(url, {
      etag,
      token: options.token,
      timeoutMs: 15000,
    });

    if (result.status === 304) {
      metrics.unchanged += 1;
      if (result.etag) {
        state.repoEtags[repoName] = result.etag;
      }
      return cache[repoName] ?? null;
    }

    if (result.status === 404) {
      metrics.notFound += 1;
      cache[repoName] = null;
      return null;
    }

    if (result.status === 200 && result.body) {
      metrics.updated += 1;
      if (result.etag) {
        state.repoEtags[repoName] = result.etag;
      }
      const json = JSON.parse(new TextDecoder('utf-8').decode(result.body)) as Record<string, unknown>;
      const enriched: GitHubRepoMetadata = {
        stars: typeof json.stargazers_count === 'number' ? json.stargazers_count : 0,
        forks: typeof json.forks_count === 'number' ? json.forks_count : 0,
        language: typeof json.language === 'string' ? json.language : '',
        updated_at:
          typeof json.updated_at === 'string' ? json.updated_at : '',
        topics: Array.isArray(json.topics)
          ? (json.topics as unknown[]).filter(
              (t): t is string => typeof t === 'string'
            )
          : [],
      };
      cache[repoName] = enriched;
      return enriched;
    }

    if (isRateLimitResponse(result.status as number, result.headers)) {
      metrics.rateLimitHits += 1;
      const resetEpoch = parseRateLimitReset(result.headers);
      const waitMs = Math.max(1000, resetEpoch * 1000 - Date.now() + 1000);
      await sleep(waitMs);
      if (attempt > maxRetries) {
        throw new Error(
          `Rate limit retries exhausted for repo ${repoName}`
        );
      }
      continue;
    }

    if (attempt > maxRetries) {
      throw new Error(
        `Failed to enrich repo ${repoName}: status=${result.status}`
      );
    }

    const backoffMs = 1000 * Math.pow(2, attempt - 1);
    await sleep(backoffMs);
  }
}