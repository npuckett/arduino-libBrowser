/**
 * Ranked text search for Arduino libraries.
 *
 * Adapts the proven ranking + synonym-expansion logic from the main project's
 * `index.html` (inline search engine) and `pipeline/src/transforms/fuzzy-search.ts`.
 * Multi-term AND matching with relevance tiers, synonym expansion, and 1-typo
 * fuzzy tolerance on library names.
 */

import type { Library } from './types.js';

/* -------------------------------------------------------------------------- */
/* Synonym expansion (mirrors fuzzy-search.ts SYNONYMS)                        */
/* -------------------------------------------------------------------------- */

const SYNONYMS: Record<string, string[]> = {
  wifi: ['wireless', 'esp', 'network', 'tcp', 'udp'],
  screen: ['display', 'lcd', 'oled', 'tft', 'e-ink'],
  motor: ['servo', 'stepper', 'pwm'],
  sensor: ['sense', 'detect', 'measure'],
  audio: ['sound', 'mp3', 'wav', 'speaker', 'i2s'],
  light: ['led', 'neopixel', 'ws2812', 'rgb'],
  power: ['battery', 'solar', 'voltage'],
  time: ['rtc', 'clock', 'timer'],
};

/** Expand a single token into itself plus its synonyms (case-insensitive). */
function expandToken(token: string): string[] {
  const t = token.toLowerCase();
  const out = new Set<string>([t]);
  for (const [key, values] of Object.entries(SYNONYMS)) {
    if (key === t) {
      for (const v of values) out.add(v);
    } else if (values.includes(t)) {
      out.add(key);
      for (const v of values) out.add(v);
    }
  }
  return [...out];
}

/* -------------------------------------------------------------------------- */
/* Levenshtein distance (for fuzzy name matching + did-you-mean)              */
/* -------------------------------------------------------------------------- */

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ci = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ci === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j]! + 1;
      const ins = curr[j - 1]! + 1;
      const sub = prev[j - 1]! + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/**
 * 1-typo tolerance for queries of 4+ chars, else exact match required.
 * Compares against each individual word of the name (not the full string) so
 * that a query like "adrafuit" matches the word "Adafruit" inside
 * "Adafruit GFX Library".
 */
function fuzzyNameHit(query: string, name: string): boolean {
  const q = query.toLowerCase();
  const words = name.toLowerCase().split(/[\s\-_/.]+/).filter(Boolean);
  for (const w of words) {
    if (q.length < 4) {
      if (w.includes(q)) return true;
    } else if (levenshtein(q, w) <= 1) {
      return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

/** Relevance tier — lower number = higher rank. */
const TIER = {
  NAME_STARTS_WITH: 0,
  NAME_CONTAINS: 1,
  FUZZY_NAME: 2,
  CATEGORY_MATCH: 3,
  DESCRIPTION_MATCH: 4,
} as const;

export interface SearchFilters {
  query: string;
  category?: string;
  architecture?: string;
  minStars?: number;
  limit?: number;
}

interface Scored {
  lib: Library;
  tier: number;
  stars: number;
}

/**
 * Search the catalog. Returns a ranked, deduplicated list of libraries.
 *
 * Logic:
 *   1. Tokenize the query (whitespace).
 *   2. For each token, expand synonyms, then require a hit in the combined
 *      text corpus (name / category / description). A library matches only if
 *      EVERY token hits (multi-term AND).
 *   3. Assign a relevance tier by the best-matching token (name startsWith >
 *      name contains > fuzzy name > category > description).
 *   4. Apply optional structured filters (category, architecture, min stars).
 *   5. Sort by tier asc, then GitHub stars desc.
 */
export function searchLibraries(
  libraries: Library[],
  filters: SearchFilters
): Library[] {
  const { query, category, architecture, minStars, limit } = filters;
  const limitNum = typeof limit === 'number' && limit > 0 ? Math.min(limit, 100) : 20;

  // Normalize structured filters once.
  const catFilter = category?.trim().toLowerCase();
  const archFilter = architecture?.trim().toLowerCase();
  const starsFilter = typeof minStars === 'number' ? minStars : 0;

  const rawTokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Each token → array of expanded variants.
  const tokenVariants = rawTokens.map(expandToken);

  const scored: Scored[] = [];

  for (const lib of libraries) {
    // --- structured filters (applied first as cheap pruning) ---------------
    if (catFilter && lib.category.toLowerCase() !== catFilter) continue;
    if (
      archFilter &&
      !(lib.architectures ?? []).some((a) => a.toLowerCase() === archFilter || a === '*')
    ) {
      continue;
    }
    if (starsFilter > 0 && (lib.github_stars ?? 0) < starsFilter) continue;

    // If there is no text query, the structured filters alone define the set.
    if (tokenVariants.length === 0) {
      scored.push({ lib, tier: TIER.DESCRIPTION_MATCH, stars: lib.github_stars ?? 0 });
      continue;
    }

    // --- text matching (multi-term AND) -----------------------------------
    const nameLower = lib.name.toLowerCase();
    const categoryLower = lib.category.toLowerCase();
    const descLower = `${lib.sentence} ${lib.paragraph}`.toLowerCase();

    let allTokensHit = true;
    let bestTier = Number.MAX_SAFE_INTEGER;

    for (const variants of tokenVariants) {
      let tokenTier: number | null = null;
      for (const v of variants) {
        if (nameLower.startsWith(v)) {
          tokenTier = Math.min(tokenTier ?? Infinity, TIER.NAME_STARTS_WITH);
          break; // can't beat startsWith for this token
        }
        if (nameLower.includes(v)) {
          tokenTier = Math.min(tokenTier ?? Infinity, TIER.NAME_CONTAINS);
        } else if (fuzzyNameHit(v, nameLower)) {
          tokenTier = Math.min(tokenTier ?? Infinity, TIER.FUZZY_NAME);
        } else if (categoryLower.includes(v)) {
          tokenTier = Math.min(tokenTier ?? Infinity, TIER.CATEGORY_MATCH);
        } else if (descLower.includes(v)) {
          tokenTier = Math.min(tokenTier ?? Infinity, TIER.DESCRIPTION_MATCH);
        }
      }
      if (tokenTier === null) {
        allTokensHit = false;
        break;
      }
      if (tokenTier < bestTier) bestTier = tokenTier;
    }

    if (!allTokensHit) continue;
    scored.push({ lib, tier: bestTier, stars: lib.github_stars ?? 0 });
  }

  scored.sort((a, b) => a.tier - b.tier || b.stars - a.stars);
  return scored.slice(0, limitNum).map((s) => s.lib);
}

/**
 * "Did you mean?" — closest fuzzy library name for a zero-result query.
 * Matches against individual words of each name so partial typos like
 * "adrafuit" → "Adafruit ..." are caught. Returns the best candidate name,
 * or null if none is close enough.
 */
export function didYouMean(query: string, libraries: Library[]): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // Only allow ~30% edit distance relative to query length.
  const maxAllowed = Math.max(1, Math.floor(q.length * 0.3));

  let best: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const lib of libraries) {
    const words = lib.name.toLowerCase().split(/[\s\-_/.]+/).filter(Boolean);
    for (const w of words) {
      const d = levenshtein(q, w);
      if (d <= maxAllowed && d < bestDist) {
        bestDist = d;
        best = lib.name;
      }
    }
  }
  return best;
}
