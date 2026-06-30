import { describe, it, expect } from 'vitest';

import { pickByTheme } from '../../src/transforms/theme-picker.js';
import type { Library, Theme } from '../../src/types.js';

function makeLib(overrides: Partial<Library> = {}): Library {
  return {
    repository_name: 'owner/Repo',
    repository_url: 'https://github.com/owner/Repo',
    name: 'Repo',
    version: '1.0.0',
    version_history: [{ version: '1.0.0', seen_at: '2025-01-01T00:00:00Z' }],
    release_count: 1,
    first_seen_at: '2025-01-01T00:00:00Z',
    last_seen_sha: 'abc',
    author: 'Test',
    maintainer: 'Test',
    sentence: 'short',
    paragraph: '',
    category: 'Sensors',
    architectures: ['*'],
    github_stars: 10,
    github_updated_at: '2025-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('pickByTheme', () => {
  it('filters by categories_any only', () => {
    const libs = [
      makeLib({ name: 'Sensor1', category: 'Sensors' }),
      makeLib({ name: 'Display1', category: 'Display' }),
      makeLib({ name: 'Comm1', category: 'Communication' }),
    ];
    const theme: Theme = {
      id: 'sensors',
      title: 'Sensors',
      criteria: { categories_any: ['Sensors'] },
      count: 10,
    };
    const out = pickByTheme(libs, theme);
    expect(out.map((l) => l.name)).toEqual(['Sensor1']);
  });

  it('filters by architectures_any only', () => {
    const libs = [
      makeLib({ name: 'A', architectures: ['esp32'] }),
      makeLib({ name: 'B', architectures: ['samd'] }),
      makeLib({ name: 'C', architectures: ['esp32', 'samd'] }),
    ];
    const theme: Theme = {
      id: 'esp',
      title: 'ESP',
      criteria: { architectures_any: ['esp32'] },
      count: 10,
    };
    const out = pickByTheme(libs, theme);
    expect(out.map((l) => l.name).sort()).toEqual(['A', 'C']);
  });

  it('combines categories_any and architectures_any', () => {
    const libs = [
      makeLib({ name: 'A', category: 'Sensors', architectures: ['esp32'] }),
      makeLib({ name: 'B', category: 'Sensors', architectures: ['samd'] }),
      makeLib({ name: 'C', category: 'Display', architectures: ['esp32'] }),
    ];
    const theme: Theme = {
      id: 'iot',
      title: 'IoT',
      criteria: {
        categories_any: ['Sensors'],
        architectures_any: ['esp32'],
      },
      count: 10,
    };
    const out = pickByTheme(libs, theme);
    expect(out.map((l) => l.name)).toEqual(['A']);
  });

  it('excludes libraries without github_stars when min_stars is set', () => {
    const libs = [
      makeLib({ name: 'HasStars', github_stars: 50 }),
      makeLib({ name: 'NoStars', github_stars: undefined }),
      makeLib({ name: 'LowStars', github_stars: 5 }),
      makeLib({ name: 'HighStars', github_stars: 200 }),
    ];
    const theme: Theme = {
      id: 'min',
      title: 'Min stars',
      criteria: { min_stars: 25 },
      count: 10,
    };
    const out = pickByTheme(libs, theme);
    expect(out.map((l) => l.name)).toEqual(['HighStars', 'HasStars']);
  });

  it('allows libraries without github_stars when min_stars is 0', () => {
    const libs = [
      makeLib({ name: 'A', github_stars: undefined }),
      makeLib({ name: 'B', github_stars: 5 }),
    ];
    const theme: Theme = {
      id: 'all',
      title: 'All',
      criteria: { min_stars: 0 },
      count: 10,
    };
    const out = pickByTheme(libs, theme);
    expect(out).toHaveLength(2);
  });

  it('applies exclude_categories', () => {
    const libs = [
      makeLib({ name: 'Sensor', category: 'Sensors' }),
      makeLib({ name: 'Display', category: 'Display' }),
      makeLib({ name: 'Other', category: 'Other' }),
    ];
    const theme: Theme = {
      id: 'no-display',
      title: 'No display',
      criteria: { exclude_categories: ['Display'] },
      count: 10,
    };
    const out = pickByTheme(libs, theme);
    expect(out.map((l) => l.name).sort()).toEqual(['Other', 'Sensor']);
  });

  it('caps results at theme.count even when more match', () => {
    const libs = Array.from({ length: 10 }, (_, i) =>
      makeLib({
        name: `Lib${String(i).padStart(2, '0')}`,
        github_stars: 100 - i,
      })
    );
    const theme: Theme = {
      id: 'cap',
      title: 'Cap',
      criteria: {},
      count: 3,
    };
    const out = pickByTheme(libs, theme);
    expect(out).toHaveLength(3);
    expect(out.map((l) => l.name)).toEqual(['Lib00', 'Lib01', 'Lib02']);
  });

  it('returns fewer results when not enough match', () => {
    const libs = [makeLib({ name: 'Only' })];
    const theme: Theme = {
      id: 'many',
      title: 'Many',
      criteria: { categories_any: ['Display'] },
      count: 5,
    };
    const out = pickByTheme(libs, theme);
    expect(out).toEqual([]);
  });

  it('returns empty array when no matches exist', () => {
    const libs = [makeLib({ name: 'A', category: 'Sensors' })];
    const theme: Theme = {
      id: 'none',
      title: 'None',
      criteria: { categories_any: ['NonExistent'] },
      count: 5,
    };
    expect(pickByTheme(libs, theme)).toEqual([]);
  });

  it('returns empty array when no libraries provided', () => {
    const theme: Theme = {
      id: 'any',
      title: 'Any',
      criteria: {},
      count: 5,
    };
    expect(pickByTheme([], theme)).toEqual([]);
  });

  it('sorts by stars desc, then updated_at desc, then name asc', () => {
    const libs = [
      makeLib({
        name: 'Banana',
        github_stars: 50,
        github_updated_at: '2025-06-01T00:00:00Z',
      }),
      makeLib({
        name: 'Apple',
        github_stars: 50,
        github_updated_at: '2025-07-01T00:00:00Z',
      }),
      makeLib({
        name: 'Cherry',
        github_stars: 100,
        github_updated_at: '2025-01-01T00:00:00Z',
      }),
      makeLib({
        name: 'Date',
        github_stars: 100,
        github_updated_at: '2025-08-01T00:00:00Z',
      }),
      makeLib({
        name: 'Elderberry',
        github_stars: 25,
        github_updated_at: '2025-05-01T00:00:00Z',
      }),
    ];
    const theme: Theme = {
      id: 'sort',
      title: 'Sort',
      criteria: {},
      count: 10,
    };
    const out = pickByTheme(libs, theme);
    expect(out.map((l) => l.name)).toEqual([
      'Date',
      'Cherry',
      'Apple',
      'Banana',
      'Elderberry',
    ]);
  });

  it('matches categories case-insensitively', () => {
    const libs = [
      makeLib({ name: 'A', category: 'SENSORS' }),
      makeLib({ name: 'B', category: 'sensors' }),
      makeLib({ name: 'C', category: 'Display' }),
    ];
    const theme: Theme = {
      id: 'ci',
      title: 'CI',
      criteria: { categories_any: ['Sensors'] },
      count: 10,
    };
    const out = pickByTheme(libs, theme);
    expect(out.map((l) => l.name).sort()).toEqual(['A', 'B']);
  });
});