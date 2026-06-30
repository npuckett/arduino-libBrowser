import type { Library, StatsOutput } from '../types.js';
import {
  forgottenClassics,
  hiddenGems,
  mostDependedOn,
  trending,
} from '../transforms/computed-picks.js';

export interface BuildStatsJsonOptions {
  now?: number;
  hiddenGemsLimit?: number;
  trendingLimit?: number;
  forgottenClassicsLimit?: number;
  mostDependedOnLimit?: number;
}

function buildCategoryCounts(libraries: Library[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const lib of libraries) {
    if (typeof lib.category !== 'string') {
      continue;
    }
    const key = lib.category.trim().toLowerCase();
    if (key.length === 0) {
      continue;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function buildStatsJson(
  libraries: Library[],
  trendingScores: Record<string, number> = {},
  options: BuildStatsJsonOptions = {}
): StatsOutput {
  const computedOptions = {
    now: options.now,
    hiddenGemsLimit: options.hiddenGemsLimit,
    trendingLimit: options.trendingLimit,
    forgottenClassicsLimit: options.forgottenClassicsLimit,
    mostDependedOnLimit: options.mostDependedOnLimit,
  };

  return {
    categories: buildCategoryCounts(libraries),
    trending: trending(libraries, trendingScores, computedOptions),
    hidden_gems: hiddenGems(libraries, computedOptions),
    most_depended_on: mostDependedOn(libraries, computedOptions),
    forgotten_classics: forgottenClassics(libraries, computedOptions),
  };
}