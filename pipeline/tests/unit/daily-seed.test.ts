import { describe, it, expect } from 'vitest';

import {
  computeDateSeed,
  dailySeed,
} from '../../src/transforms/daily-seed.js';
import type { Library } from '../../src/types.js';

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
    sentence: '',
    paragraph: '',
    category: '',
    architectures: ['*'],
    ...overrides,
  };
}

describe('computeDateSeed', () => {
  it('matches the PowerShell algorithm: sum of UTF-16 char codes', () => {
    expect(computeDateSeed('2025-08-06')).toBe(497);
  });

  it('returns 0 for empty string', () => {
    expect(computeDateSeed('')).toBe(0);
  });

  it('produces the same value for identical input', () => {
    expect(computeDateSeed('2025-01-01')).toBe(computeDateSeed('2025-01-01'));
  });

  it('produces different values for different inputs', () => {
    expect(computeDateSeed('2025-01-01')).not.toBe(
      computeDateSeed('2025-01-02')
    );
  });
});

describe('dailySeed', () => {
  it('returns same seed for same date', () => {
    expect(dailySeed('2025-08-06', 100)).toBe(dailySeed('2025-08-06', 100));
  });

  it('returns different seeds for different dates (with high probability)', () => {
    const a = dailySeed('2025-08-06', 9524);
    const b = dailySeed('2025-08-07', 9524);
    expect(a).not.toBe(b);
  });

  it('returns seed % count when no filter provided', () => {
    const date = '2025-08-06';
    const count = 9524;
    expect(dailySeed(date, count)).toBe(497 % count);
  });

  it('only considers libs that pass the filter', () => {
    const libs = [
      makeLib({ repository_name: 'a/A', name: 'A' }),
      makeLib({ repository_name: 'b/B', name: 'B' }),
      makeLib({ repository_name: 'c/C', name: 'C' }),
      makeLib({ repository_name: 'd/D', name: 'D' }),
    ];
    const seed = computeDateSeed('2025-08-06');
    const filteredCount = 2;
    const out = dailySeed(
      '2025-08-06',
      libs.length,
      (lib) => lib.name === 'A' || lib.name === 'C',
      { libraries: libs }
    );
    expect(out).toBe(seed % filteredCount);
  });

  it('returns 0 when filter eliminates all libraries', () => {
    const libs = [makeLib({ name: 'A' })];
    const out = dailySeed(
      '2025-08-06',
      10,
      () => false,
      { libraries: libs }
    );
    expect(out).toBe(0);
  });

  it('verifies against the current site algorithm (same input -> same output)', () => {
    const date = '2025-08-06';
    const total = 9524;
    const expectedSeed = date
      .split('')
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    expect(dailySeed(date, total)).toBe(expectedSeed % total);
  });
});