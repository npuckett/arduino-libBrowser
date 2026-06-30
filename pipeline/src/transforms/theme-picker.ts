import type { Library, Theme } from '../types.js';

function categoryMatches(library: Library, allowed: string[]): boolean {
  if (typeof library.category !== 'string') {
    return false;
  }
  const normalized = library.category.trim().toLowerCase();
  for (const entry of allowed) {
    if (entry.trim().toLowerCase() === normalized) {
      return true;
    }
  }
  return false;
}

function architectureMatches(library: Library, allowed: string[]): boolean {
  if (!Array.isArray(library.architectures)) {
    return false;
  }
  const allowedLower = new Set(allowed.map((a) => a.trim().toLowerCase()));
  for (const arch of library.architectures) {
    if (allowedLower.has(String(arch).trim().toLowerCase())) {
      return true;
    }
  }
  return false;
}

function hasStars(lib: Library): boolean {
  return typeof lib.github_stars === 'number' && Number.isFinite(lib.github_stars);
}

function getUpdatedAtMs(lib: Library): number {
  if (!lib.github_updated_at) {
    return 0;
  }
  const ms = Date.parse(lib.github_updated_at);
  return Number.isNaN(ms) ? 0 : ms;
}

function getStars(lib: Library): number {
  return hasStars(lib) ? (lib.github_stars as number) : 0;
}

function getName(lib: Library): string {
  return typeof lib.name === 'string' ? lib.name : '';
}

export function pickByTheme(libraries: Library[], theme: Theme): Library[] {
  if (!Array.isArray(libraries) || libraries.length === 0) {
    return [];
  }
  if (!theme || !theme.criteria) {
    return [];
  }

  const criteria = theme.criteria;
  const categoriesAny = Array.isArray(criteria.categories_any)
    ? criteria.categories_any
    : null;
  const architecturesAny = Array.isArray(criteria.architectures_any)
    ? criteria.architectures_any
    : null;
  const excludeCategories = Array.isArray(criteria.exclude_categories)
    ? criteria.exclude_categories
    : null;
  const minStars =
    typeof criteria.min_stars === 'number' && Number.isFinite(criteria.min_stars)
      ? criteria.min_stars
      : 0;

  const filtered: Library[] = [];
  for (const lib of libraries) {
    if (categoriesAny && categoriesAny.length > 0) {
      if (!categoryMatches(lib, categoriesAny)) {
        continue;
      }
    }
    if (architecturesAny && architecturesAny.length > 0) {
      if (!architectureMatches(lib, architecturesAny)) {
        continue;
      }
    }
    if (minStars > 0) {
      if (!hasStars(lib) || (lib.github_stars as number) < minStars) {
        continue;
      }
    }
    if (excludeCategories && excludeCategories.length > 0) {
      if (categoryMatches(lib, excludeCategories)) {
        continue;
      }
    }
    filtered.push(lib);
  }

  filtered.sort((a, b) => {
    const starsDiff = getStars(b) - getStars(a);
    if (starsDiff !== 0) {
      return starsDiff;
    }
    const updatedDiff = getUpdatedAtMs(b) - getUpdatedAtMs(a);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }
    return getName(a).localeCompare(getName(b));
  });

  const limit = Math.max(0, theme.count | 0);
  return filtered.slice(0, limit);
}