import type { Library } from '../types.js';

export function computeDateSeed(date: string): number {
  if (typeof date !== 'string' || date.length === 0) {
    return 0;
  }
  let seed = 0;
  for (let i = 0; i < date.length; i++) {
    seed += date.charCodeAt(i);
  }
  return seed;
}

export interface DailySeedOptions {
  libraries?: Library[];
}

export function dailySeed(
  date: string,
  count: number,
  filter?: (lib: Library) => boolean,
  options: DailySeedOptions = {}
): number {
  const seed = computeDateSeed(date);
  const totalCount = Math.max(0, Math.floor(count));

  if (filter && Array.isArray(options.libraries) && options.libraries.length > 0) {
    const filtered = options.libraries.filter(filter);
    if (filtered.length === 0) {
      return 0;
    }
    return seed % filtered.length;
  }

  return seed % totalCount;
}