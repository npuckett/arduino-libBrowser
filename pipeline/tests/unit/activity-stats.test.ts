import { describe, it, expect } from 'vitest';

import { buildActivityStats } from '../../src/transforms/activity-stats.js';
import type { Library } from '../../src/types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ANCHOR_DAY = '2026-07-01T12:00:00Z';
const ANCHOR_MS = Date.parse(ANCHOR_DAY);

function makeLib(overrides: Partial<Library> & {
  repo: string;
  first_seen_at: string;
  history?: Array<{ version: string; seen_at: string }>;
}): Library {
  return {
    repository_name: overrides.repo,
    repository_url: `https://github.com/${overrides.repo}`,
    name: overrides.repo.split('/')[1] ?? overrides.repo,
    version: '1.0.0',
    version_history: overrides.history ?? [
      { version: '1.0.0', seen_at: overrides.first_seen_at },
    ],
    release_count: overrides.history?.length ?? 1,
    first_seen_at: overrides.first_seen_at,
    last_seen_sha: 'abc',
    author: 'a',
    maintainer: 'a',
    sentence: '',
    paragraph: '',
    category: overrides.category ?? 'Other',
    architectures: ['*'],
  };
}

describe('buildActivityStats', () => {
  it('returns empty daily/weekly and empty categories for an empty library list', () => {
    const out = buildActivityStats([], { now: ANCHOR_MS });
    expect(out.daily).toHaveLength(30);
    expect(out.weekly).toHaveLength(12);
    expect(out.daily.every((b) => b.new === 0 && b.updated === 0)).toBe(true);
    expect(out.weekly.every((b) => b.new === 0 && b.updated === 0)).toBe(true);
    expect(out.categories_top).toEqual([]);
    expect(out.total_libraries).toBe(0);
  });

  it('counts a single first-seen release as new in the correct daily bucket', () => {
    const lib = makeLib({ repo: 'a/a', first_seen_at: '2026-06-30T08:30:00Z' });
    const out = buildActivityStats([lib], { now: ANCHOR_MS });
    const dayBeforeYesterday = out.daily.find((b) => b.date === '2026-06-30');
    expect(dayBeforeYesterday).toBeDefined();
    expect(dayBeforeYesterday?.new).toBe(1);
    expect(dayBeforeYesterday?.updated).toBe(0);
  });

  it('counts a subsequent release as updated, not new', () => {
    const lib = makeLib({
      repo: 'b/b',
      first_seen_at: '2026-06-15T08:00:00Z',
      history: [
        { version: '1.0.0', seen_at: '2026-06-15T08:00:00Z' },
        { version: '1.0.1', seen_at: '2026-06-25T08:00:00Z' },
      ],
    });
    const out = buildActivityStats([lib], { now: ANCHOR_MS });
    const firstDay = out.daily.find((b) => b.date === '2026-06-15');
    const laterDay = out.daily.find((b) => b.date === '2026-06-25');
    expect(firstDay?.new).toBe(1);
    expect(firstDay?.updated).toBe(0);
    expect(laterDay?.new).toBe(0);
    expect(laterDay?.updated).toBe(1);
  });

  it('places buckets on UTC day boundaries', () => {
    const lib = makeLib({ repo: 'c/c', first_seen_at: '2026-07-01T01:00:00Z' });
    const out = buildActivityStats([lib], { now: ANCHOR_MS });
    const today = out.daily.find((b) => b.date === '2026-07-01');
    expect(today?.new).toBe(1);
  });

  it('ignores events older than the daily window', () => {
    const lib = makeLib({ repo: 'd/d', first_seen_at: '2026-01-01T00:00:00Z' });
    const out = buildActivityStats([lib], { now: ANCHOR_MS });
    const total = out.daily.reduce((acc, b) => acc + b.new + b.updated, 0);
    expect(total).toBe(0);
  });

  it('rolls daily buckets into ISO week buckets', () => {
    const lib = makeLib({
      repo: 'e/e',
      first_seen_at: '2026-06-30T08:00:00Z',
      history: [
        { version: '1.0.0', seen_at: '2026-06-30T08:00:00Z' },
        { version: '1.0.1', seen_at: '2026-07-01T08:00:00Z' },
      ],
    });
    const out = buildActivityStats([lib], { now: ANCHOR_MS });
    const lastWeek = out.weekly.find((b) => b.week_start === '2026-06-29');
    expect(lastWeek).toBeDefined();
    expect(lastWeek?.new).toBe(1);
    expect(lastWeek?.updated).toBe(1);
  });

  it('rolls long-tail categories into Other', () => {
    const libs: Library[] = [];
    for (let i = 0; i < 15; i++) {
      libs.push(makeLib({ repo: `a${i}/a${i}`, first_seen_at: '2026-07-01T00:00:00Z', category: `cat-${i}` }));
    }
    for (let i = 0; i < 5; i++) {
      libs.push(makeLib({ repo: `b${i}/b${i}`, first_seen_at: '2026-07-01T00:00:00Z', category: 'top' }));
    }
    const out = buildActivityStats(libs, { now: ANCHOR_MS, topCategoryLimit: 10 });
    expect(out.categories_top.length).toBeLessThanOrEqual(11);
    const other = out.categories_top.find((s) => s.category === 'Other categories');
    expect(other).toBeDefined();
    const sumSlices = out.categories_top.reduce((acc, s) => acc + s.count, 0);
    expect(sumSlices).toBe(20);
  });

  it('is deterministic for the same input', () => {
    const libs = [
      makeLib({ repo: 'a/a', first_seen_at: '2026-07-01T08:00:00Z' }),
      makeLib({ repo: 'b/b', first_seen_at: '2026-06-30T08:00:00Z', history: [
        { version: '1.0.0', seen_at: '2026-06-30T08:00:00Z' },
        { version: '1.0.1', seen_at: '2026-07-01T08:00:00Z' },
      ]}),
    ];
    const a = buildActivityStats(libs, { now: ANCHOR_MS });
    const b = buildActivityStats(libs, { now: ANCHOR_MS });
    expect(a).toEqual(b);
  });

  it('produces exactly 30 daily and 12 weekly buckets by default', () => {
    const out = buildActivityStats([], { now: ANCHOR_MS });
    expect(out.daily).toHaveLength(30);
    expect(out.weekly).toHaveLength(12);
  });

  it('shares sum to roughly 1.0 across category slices', () => {
    const libs: Library[] = [];
    for (let i = 0; i < 50; i++) {
      libs.push(makeLib({ repo: `r${i}/r${i}`, first_seen_at: '2026-07-01T00:00:00Z', category: i % 3 === 0 ? 'a' : 'b' }));
    }
    const out = buildActivityStats(libs, { now: ANCHOR_MS, topCategoryLimit: 5 });
    const sum = out.categories_top.reduce((acc, s) => acc + s.share, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('daily buckets are sorted oldest → newest', () => {
    const out = buildActivityStats([], { now: ANCHOR_MS });
    const dates = out.daily.map((b) => b.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
    const last = out.daily[out.daily.length - 1];
    expect(last?.date).toBe('2026-07-01');
  });
});

void MS_PER_DAY;
