import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  ChangesOutput,
  Editor,
  Library,
  PicksComputed,
  PicksOutput,
  Theme,
} from '../types.js';
import { pickByTheme } from '../transforms/theme-picker.js';
import {
  forgottenClassics,
  hiddenGems,
  mostDependedOn,
  trending,
} from '../transforms/computed-picks.js';

const COMPUTED_TOP_N = 8;

export interface EditorsFile {
  editors: Editor[];
}

export interface ThemesFile {
  themes: Theme[];
}

export interface BuildPicksJsonOptions {
  now?: Date;
  hiddenGemsLimit?: number;
  trendingLimit?: number;
  forgottenClassicsLimit?: number;
  trendingScores?: Record<string, number>;
}

function readEditorsFile(editorsPath: string): Editor[] {
  const absPath = resolve(editorsPath);
  if (!existsSync(absPath)) {
    return [];
  }
  try {
    const raw = readFileSync(absPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<EditorsFile> | Editor[];
    if (Array.isArray(parsed)) {
      return parsed as Editor[];
    }
    if (parsed && Array.isArray(parsed.editors)) {
      return parsed.editors;
    }
    return [];
  } catch {
    return [];
  }
}

function readThemesFile(themesPath: string): Theme[] {
  const absPath = resolve(themesPath);
  if (!existsSync(absPath)) {
    return [];
  }
  try {
    const raw = readFileSync(absPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ThemesFile> | Theme[];
    if (Array.isArray(parsed)) {
      return parsed as Theme[];
    }
    if (parsed && Array.isArray(parsed.themes)) {
      return parsed.themes;
    }
    return [];
  } catch {
    return [];
  }
}

function buildComputed(
  libraries: Library[],
  changes: ChangesOutput,
  trendingScores: Record<string, number>,
  options: BuildPicksJsonOptions,
  now: number
): PicksComputed {
  return {
    new_this_week: [...changes.new_libraries]
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, COMPUTED_TOP_N),
    updated_this_week: [...changes.updated_libraries]
      .sort((a, b) => b.library.name.localeCompare(a.library.name))
      .slice(0, COMPUTED_TOP_N),
    hidden_gems: hiddenGems(libraries, {
      now,
      hiddenGemsLimit: options.hiddenGemsLimit,
    }),
    trending: trending(libraries, trendingScores, {
      now,
      trendingLimit: options.trendingLimit,
    }),
    forgotten_classics: forgottenClassics(libraries, {
      now,
      forgottenClassicsLimit: options.forgottenClassicsLimit,
    }),
  };
}

export function buildPicksJson(
  libraries: Library[],
  editorsPath: string,
  themesPath: string,
  changes: ChangesOutput,
  options: BuildPicksJsonOptions = {}
): PicksOutput {
  const now = options.now ?? new Date();
  const editors = readEditorsFile(editorsPath);
  const themes = readThemesFile(themesPath);
  const trendingScores = options.trendingScores ?? {};

  const themePicks: Record<string, Library[]> = {};
  for (const theme of themes) {
    themePicks[theme.id] = pickByTheme(libraries, theme);
  }

  const computed = buildComputed(libraries, changes, trendingScores, options, now.getTime());

  return {
    generated_at: now.toISOString(),
    editors,
    themes: themePicks,
    computed,
  };
}