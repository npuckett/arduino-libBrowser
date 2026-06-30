export const SYNONYMS: Record<string, string[]> = {
  wifi: ['wireless', 'esp', 'network', 'tcp', 'udp'],
  screen: ['display', 'lcd', 'oled', 'tft', 'e-ink'],
  motor: ['servo', 'stepper', 'pwm'],
  sensor: ['sense', 'detect', 'measure'],
  audio: ['sound', 'mp3', 'wav', 'speaker', 'i2s'],
  light: ['led', 'neopixel', 'ws2812', 'rgb'],
  power: ['battery', 'solar', 'voltage'],
  time: ['rtc', 'clock', 'timer'],
};

const FUZZY_TYPO_THRESHOLD = 4;

export function levenshtein(a: string, b: string): number {
  const left = typeof a === 'string' ? a : '';
  const right = typeof b === 'string' ? b : '';
  if (left === right) {
    return 0;
  }
  if (left.length === 0) {
    return right.length;
  }
  if (right.length === 0) {
    return left.length;
  }

  const m = left.length;
  const n = right.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const charI = left.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = charI === right.charCodeAt(j - 1) ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      let best = del < ins ? del : ins;
      if (sub < best) {
        best = sub;
      }
      curr[j] = best;
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[n] ?? m;
}

export interface FuzzyMatchResult {
  match: boolean;
  distance: number;
  similarity: number;
}

export function fuzzyMatchName(query: string, name: string): FuzzyMatchResult {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  const n = typeof name === 'string' ? name.trim().toLowerCase() : '';

  if (q.length === 0) {
    return { match: false, distance: 0, similarity: 0 };
  }
  if (n.length === 0) {
    return { match: false, distance: q.length, similarity: 0 };
  }

  const distance = levenshtein(q, n);
  const maxLen = Math.max(q.length, n.length);
  const similarity = maxLen === 0 ? 1 : 1 - distance / maxLen;

  const allowedTypos = q.length >= FUZZY_TYPO_THRESHOLD ? 1 : 0;
  const match = distance <= allowedTypos;

  return { match, distance, similarity };
}

export function expandSynonyms(query: string): string[] {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (q.length === 0) {
    return [];
  }
  const expansions = new Set<string>([q]);
  for (const [key, values] of Object.entries(SYNONYMS)) {
    if (key === q) {
      for (const v of values) {
        expansions.add(v);
      }
      continue;
    }
    if (values.includes(q)) {
      expansions.add(key);
    }
  }
  return Array.from(expansions);
}

export function didYouMean(query: string, allNames: string[]): string | null {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (q.length === 0 || !Array.isArray(allNames) || allNames.length === 0) {
    return null;
  }

  const hasExactPrefix = allNames.some((name) => {
    if (typeof name !== 'string') {
      return false;
    }
    return name.trim().toLowerCase().startsWith(q);
  });
  if (hasExactPrefix) {
    return null;
  }

  let bestName: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestSimilarity = -1;

  for (const name of allNames) {
    if (typeof name !== 'string') {
      continue;
    }
    const result = fuzzyMatchName(q, name);
    if (!result.match) {
      continue;
    }
    if (
      result.distance < bestDistance ||
      (result.distance === bestDistance && result.similarity > bestSimilarity)
    ) {
      bestDistance = result.distance;
      bestSimilarity = result.similarity;
      bestName = name;
    }
  }

  return bestName;
}