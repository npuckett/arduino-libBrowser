import type { Library } from '../types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIsoMs(value: string | undefined): number | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function ageDays(updatedAt: string | undefined, now: number): number | null {
  const ms = parseIsoMs(updatedAt);
  if (ms === null) {
    return null;
  }
  return (now - ms) / MS_PER_DAY;
}

function getStars(lib: Library): number {
  return typeof lib.github_stars === 'number' && Number.isFinite(lib.github_stars)
    ? lib.github_stars
    : 0;
}

function getUpdatedMs(lib: Library): number {
  const ms = parseIsoMs(lib.github_updated_at);
  return ms ?? 0;
}

function hasDescription(lib: Library): boolean {
  const sentence = typeof lib.sentence === 'string' ? lib.sentence.trim() : '';
  const paragraph = typeof lib.paragraph === 'string' ? lib.paragraph.trim() : '';
  return sentence.length > 0 || paragraph.length > 0;
}

function hasCategory(lib: Library): boolean {
  return typeof lib.category === 'string' && lib.category.trim().length > 0;
}

export interface ComputedPicksOptions {
  now?: number;
  hiddenGemsLimit?: number;
  trendingLimit?: number;
  forgottenClassicsLimit?: number;
  mostDependedOnLimit?: number;
}

function clampLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value | 0;
}

export function hiddenGems(
  libraries: Library[],
  options: ComputedPicksOptions = {}
): Library[] {
  const now = options.now ?? Date.now();
  const limit = clampLimit(options.hiddenGemsLimit, 20);

  const gems: Library[] = [];
  for (const lib of libraries) {
    if (getStars(lib) >= 20) {
      continue;
    }
    const age = ageDays(lib.github_updated_at, now);
    if (age === null || age >= 90) {
      continue;
    }
    if (!hasDescription(lib)) {
      continue;
    }
    if (!hasCategory(lib)) {
      continue;
    }
    gems.push(lib);
  }

  gems.sort((a, b) => {
    const starsDiff = getStars(a) - getStars(b);
    if (starsDiff !== 0) {
      return starsDiff;
    }
    return getUpdatedMs(b) - getUpdatedMs(a);
  });

  return gems.slice(0, limit);
}

export function trending(
  libraries: Library[],
  trendingScores: Record<string, number>,
  options: ComputedPicksOptions = {}
): Library[] {
  const limit = clampLimit(options.trendingLimit, 20);
  if (!trendingScores || Object.keys(trendingScores).length === 0) {
    return [];
  }

  const byRepo = new Map<string, Library>();
  for (const lib of libraries) {
    if (!byRepo.has(lib.repository_name)) {
      byRepo.set(lib.repository_name, lib);
    }
  }

  const scored: Array<{ lib: Library; score: number }> = [];
  for (const lib of libraries) {
    const score = trendingScores[lib.repository_name];
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      continue;
    }
    scored.push({ lib, score });
  }

  scored.sort((a, b) => {
    const diff = b.score - a.score;
    if (diff !== 0) {
      return diff;
    }
    const starsDiff = getStars(b.lib) - getStars(a.lib);
    if (starsDiff !== 0) {
      return starsDiff;
    }
    return getUpdatedMs(b.lib) - getUpdatedMs(a.lib);
  });

  return scored.slice(0, limit).map((entry) => entry.lib);
}

export function forgottenClassics(
  libraries: Library[],
  options: ComputedPicksOptions = {}
): Library[] {
  const now = options.now ?? Date.now();
  const limit = clampLimit(options.forgottenClassicsLimit, 20);

  const classics: Library[] = [];
  for (const lib of libraries) {
    if (getStars(lib) <= 100) {
      continue;
    }
    const age = ageDays(lib.github_updated_at, now);
    const isStale = age === null || age > 365;
    if (!isStale) {
      continue;
    }
    classics.push(lib);
  }

  classics.sort((a, b) => {
    const starsDiff = getStars(b) - getStars(a);
    if (starsDiff !== 0) {
      return starsDiff;
    }
    return getName(a).localeCompare(getName(b));
  });

  return classics.slice(0, limit);
}

function getName(lib: Library): string {
  return typeof lib.name === 'string' ? lib.name : '';
}

export function mostDependedOn(
  libraries: Library[],
  options: ComputedPicksOptions = {}
): Library[] {
  const limit = clampLimit(options.mostDependedOnLimit, 20);

  const nameCounts = new Map<string, number>();
  const libByName = new Map<string, Library>();

  for (const lib of libraries) {
    libByName.set(lib.name, lib);
    if (!libByName.has(lib.repository_name)) {
      libByName.set(lib.repository_name, lib);
    }
    const deps = lib.depends;
    if (!Array.isArray(deps)) {
      continue;
    }
    for (const dep of deps) {
      if (typeof dep !== 'string') {
        continue;
      }
      const trimmed = dep.trim();
      if (trimmed.length === 0) {
        continue;
      }
      nameCounts.set(trimmed, (nameCounts.get(trimmed) ?? 0) + 1);
    }
  }

  const ranked: Array<{ lib: Library; count: number }> = [];
  for (const [name, count] of nameCounts) {
    const lib = libByName.get(name);
    if (!lib) {
      continue;
    }
    ranked.push({ lib, count });
  }

  ranked.sort((a, b) => {
    const diff = b.count - a.count;
    if (diff !== 0) {
      return diff;
    }
    const starsDiff = getStars(b.lib) - getStars(a.lib);
    if (starsDiff !== 0) {
      return starsDiff;
    }
    return getName(a.lib).localeCompare(getName(b.lib));
  });

  return ranked.slice(0, limit).map((entry) => entry.lib);
}