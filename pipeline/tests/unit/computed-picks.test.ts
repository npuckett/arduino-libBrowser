import { describe, it, expect } from 'vitest';

import {
  forgottenClassics,
  hiddenGems,
  mostDependedOn,
  trending,
} from '../../src/transforms/computed-picks.js';
import type { Library } from '../../src/types.js';

const NOW = Date.parse('2025-06-30T00:00:00Z');
const RECENT = '2025-06-15T00:00:00Z';
const NINETY_DAYS = '2025-04-01T00:00:00Z';
const ONE_WEEK = '2025-06-23T00:00:00Z';
const ONE_YEAR_PLUS = '2024-01-01T00:00:00Z';

function makeLib(overrides: Partial<Library> = {}): Library {
  return {
    repository_name: 'owner/Lib',
    repository_url: 'https://github.com/owner/Lib',
    name: 'Lib',
    version: '1.0.0',
    version_history: [{ version: '1.0.0', seen_at: '2025-01-01T00:00:00Z' }],
    release_count: 1,
    first_seen_at: '2025-01-01T00:00:00Z',
    last_seen_sha: 'abc',
    author: 'Test',
    maintainer: 'Test',
    sentence: 'short desc',
    paragraph: '',
    category: 'Sensors',
    architectures: ['*'],
    github_stars: 10,
    github_updated_at: RECENT,
    ...overrides,
  };
}

describe('hiddenGems', () => {
  it('includes 5-star + recent lib with description and category', () => {
    const lib = makeLib({
      name: 'Gem',
      github_stars: 5,
      github_updated_at: RECENT,
      sentence: 'great',
      category: 'Sensors',
    });
    const out = hiddenGems([lib], { now: NOW });
    expect(out.map((l) => l.name)).toEqual(['Gem']);
  });

  it('excludes 25-star lib (>= 20)', () => {
    const lib = makeLib({
      name: 'Popular',
      github_stars: 25,
      github_updated_at: RECENT,
    });
    const out = hiddenGems([lib], { now: NOW });
    expect(out).toEqual([]);
  });

  it('excludes stale lib (updated more than 90 days ago)', () => {
    const lib = makeLib({
      name: 'Stale',
      github_stars: 5,
      github_updated_at: NINETY_DAYS,
    });
    const out = hiddenGems([lib], { now: NOW });
    expect(out).toEqual([]);
  });

  it('excludes libs without updated_at', () => {
    const lib = makeLib({
      name: 'NoUpdate',
      github_stars: 5,
      github_updated_at: undefined,
    });
    const out = hiddenGems([lib], { now: NOW });
    expect(out).toEqual([]);
  });

  it('excludes libs without description', () => {
    const lib = makeLib({
      name: 'NoDesc',
      github_stars: 5,
      github_updated_at: RECENT,
      sentence: '',
      paragraph: '',
    });
    const out = hiddenGems([lib], { now: NOW });
    expect(out).toEqual([]);
  });

  it('excludes libs without category', () => {
    const lib = makeLib({
      name: 'NoCat',
      github_stars: 5,
      github_updated_at: RECENT,
      category: '',
    });
    const out = hiddenGems([lib], { now: NOW });
    expect(out).toEqual([]);
  });

  it('sorts by stars asc then updated_at desc', () => {
    const libs = [
      makeLib({
        name: 'C',
        github_stars: 5,
        github_updated_at: '2025-05-01T00:00:00Z',
      }),
      makeLib({
        name: 'A',
        github_stars: 1,
        github_updated_at: '2025-06-01T00:00:00Z',
      }),
      makeLib({
        name: 'B',
        github_stars: 1,
        github_updated_at: '2025-05-15T00:00:00Z',
      }),
      makeLib({
        name: 'D',
        github_stars: 10,
        github_updated_at: RECENT,
      }),
    ];
    const out = hiddenGems(libs, { now: NOW });
    expect(out.map((l) => l.name)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('limits results to 20', () => {
    const libs = Array.from({ length: 30 }, (_, i) =>
      makeLib({
        name: `Gem${i}`,
        github_stars: (i % 19) + 1,
        github_updated_at: RECENT,
      })
    );
    const out = hiddenGems(libs, { now: NOW });
    expect(out).toHaveLength(20);
  });
});

describe('trending', () => {
  it('sorts by trending score desc', () => {
    const libs = [
      makeLib({ repository_name: 'a/A', name: 'A' }),
      makeLib({ repository_name: 'b/B', name: 'B' }),
      makeLib({ repository_name: 'c/C', name: 'C' }),
    ];
    const scores = { 'a/A': 5, 'b/B': 20, 'c/C': 10 };
    const out = trending(libs, scores, { now: NOW });
    expect(out.map((l) => l.repository_name)).toEqual(['b/B', 'c/C', 'a/A']);
  });

  it('limits to 20', () => {
    const libs = Array.from({ length: 30 }, (_, i) =>
      makeLib({ repository_name: `o${i}/Lib${i}`, name: `Lib${i}` })
    );
    const scores: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      scores[`o${i}/Lib${i}`] = 30 - i;
    }
    const out = trending(libs, scores, { now: NOW });
    expect(out).toHaveLength(20);
    expect(out[0]?.repository_name).toBe('o0/Lib0');
  });

  it('returns empty array when no trending scores are provided', () => {
    const libs = [makeLib()];
    expect(trending(libs, {}, { now: NOW })).toEqual([]);
  });

  it('ignores libraries without a trending score', () => {
    const libs = [
      makeLib({ repository_name: 'a/A', name: 'A' }),
      makeLib({ repository_name: 'b/B', name: 'B' }),
    ];
    const out = trending(libs, { 'a/A': 10 }, { now: NOW });
    expect(out.map((l) => l.repository_name)).toEqual(['a/A']);
  });
});

describe('forgottenClassics', () => {
  it('includes 100-star + 1-year-old lib', () => {
    const lib = makeLib({
      name: 'Classic',
      github_stars: 150,
      github_updated_at: ONE_YEAR_PLUS,
    });
    const out = forgottenClassics([lib], { now: NOW });
    expect(out.map((l) => l.name)).toEqual(['Classic']);
  });

  it('includes 100-star + null updated_at', () => {
    const lib = makeLib({
      name: 'NullDate',
      github_stars: 200,
      github_updated_at: undefined,
    });
    const out = forgottenClassics([lib], { now: NOW });
    expect(out.map((l) => l.name)).toEqual(['NullDate']);
  });

  it('excludes 100-star lib updated 1 week ago', () => {
    const lib = makeLib({
      name: 'Fresh',
      github_stars: 150,
      github_updated_at: ONE_WEEK,
    });
    const out = forgottenClassics([lib], { now: NOW });
    expect(out).toEqual([]);
  });

  it('excludes 50-star lib', () => {
    const lib = makeLib({
      name: 'Mediocre',
      github_stars: 50,
      github_updated_at: ONE_YEAR_PLUS,
    });
    const out = forgottenClassics([lib], { now: NOW });
    expect(out).toEqual([]);
  });

  it('sorts by stars desc', () => {
    const libs = [
      makeLib({ name: 'C', github_stars: 150, github_updated_at: ONE_YEAR_PLUS }),
      makeLib({ name: 'A', github_stars: 500, github_updated_at: ONE_YEAR_PLUS }),
      makeLib({ name: 'B', github_stars: 300, github_updated_at: ONE_YEAR_PLUS }),
    ];
    const out = forgottenClassics(libs, { now: NOW });
    expect(out.map((l) => l.name)).toEqual(['A', 'B', 'C']);
  });

  it('limits to 20', () => {
    const libs = Array.from({ length: 25 }, (_, i) =>
      makeLib({
        name: `Classic${i}`,
        github_stars: 200 + i,
        github_updated_at: ONE_YEAR_PLUS,
      })
    );
    const out = forgottenClassics(libs, { now: NOW });
    expect(out).toHaveLength(20);
  });
});

describe('mostDependedOn', () => {
  it('counts depends references correctly', () => {
    const target = makeLib({ name: 'Adafruit_BusIO' });
    const libs = [
      target,
      makeLib({
        name: 'DepA',
        depends: ['Adafruit_BusIO', 'ArduinoJson'],
      }),
      makeLib({
        name: 'DepB',
        depends: ['Adafruit_BusIO'],
      }),
      makeLib({
        name: 'DepC',
        depends: ['Other'],
      }),
    ];
    const out = mostDependedOn(libs);
    expect(out.map((l) => l.name)).toEqual(['Adafruit_BusIO']);
  });

  it('handles libs without depends', () => {
    const libs = [
      makeLib({ name: 'A' }),
      makeLib({ name: 'B', depends: [] }),
    ];
    expect(mostDependedOn(libs)).toEqual([]);
  });

  it('sorts by count desc', () => {
    const a = makeLib({ name: 'A' });
    const b = makeLib({ name: 'B' });
    const c = makeLib({ name: 'C' });
    const libs = [
      a,
      b,
      c,
      makeLib({ name: 'X', depends: ['A', 'B', 'C'] }),
      makeLib({ name: 'Y', depends: ['A', 'B'] }),
      makeLib({ name: 'Z', depends: ['A'] }),
    ];
    const out = mostDependedOn(libs);
    expect(out.map((l) => l.name)).toEqual(['A', 'B', 'C']);
  });

  it('limits to 20', () => {
    const targets = Array.from({ length: 25 }, (_, i) =>
      makeLib({ name: `T${i}` })
    );
    const libs = [
      ...targets,
      makeLib({ name: 'User', depends: targets.map((t) => t.name) }),
    ];
    const out = mostDependedOn(libs);
    expect(out).toHaveLength(20);
  });

  it('ignores dependencies that do not match a library', () => {
    const target = makeLib({ name: 'A' });
    const libs = [
      target,
      makeLib({ name: 'X', depends: ['A', 'NotInRegistry'] }),
    ];
    const out = mostDependedOn(libs);
    expect(out.map((l) => l.name)).toEqual(['A']);
  });
});