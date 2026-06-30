import { describe, it, expect } from 'vitest';

import {
  didYouMean,
  expandSynonyms,
  fuzzyMatchName,
  levenshtein,
} from '../../src/transforms/fuzzy-search.js';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('returns 3 for kitten/sitting', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('returns the length of the non-empty string when one is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('handles single-character edits', () => {
    expect(levenshtein('a', 'b')).toBe(1);
  });

  it('is symmetric', () => {
    const pairs = [
      ['color', 'colour'],
      ['flaw', 'lawn'],
      ['gumbo', 'gambol'],
    ] as const;
    for (const [a, b] of pairs) {
      expect(levenshtein(a, b)).toBe(levenshtein(b, a));
    }
  });
});

describe('fuzzyMatchName', () => {
  it('matches exactly with distance 0 and similarity 1', () => {
    const r = fuzzyMatchName('servo', 'Servo');
    expect(r.match).toBe(true);
    expect(r.distance).toBe(0);
    expect(r.similarity).toBe(1);
  });

  it('allows 1 typo for 4+ char names', () => {
    const r = fuzzyMatchName('servo', 'sarvo');
    expect(r.match).toBe(true);
    expect(r.distance).toBe(1);
  });

  it('rejects 2 typos even on long names', () => {
    const r = fuzzyMatchName('servo', 'xyzab');
    expect(r.match).toBe(false);
  });

  it('rejects typos on short names (< 4 chars)', () => {
    const r = fuzzyMatchName('abc', 'abd');
    expect(r.match).toBe(false);
    expect(r.distance).toBe(1);
  });

  it('accepts exact match on short names', () => {
    const r = fuzzyMatchName('abc', 'abc');
    expect(r.match).toBe(true);
    expect(r.distance).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatchName('SERVO', 'servo').match).toBe(true);
    expect(fuzzyMatchName('SeRvO', 'sErVo').match).toBe(true);
  });

  it('returns similarity between 0 and 1', () => {
    const r = fuzzyMatchName('servo', 'sarvo');
    expect(r.similarity).toBeGreaterThan(0);
    expect(r.similarity).toBeLessThan(1);
  });
});

describe('expandSynonyms', () => {
  it('returns 5 expansions for wifi', () => {
    const out = expandSynonyms('wifi');
    expect(out).toHaveLength(6);
    expect(out).toContain('wifi');
    expect(out).toContain('wireless');
    expect(out).toContain('esp');
    expect(out).toContain('network');
    expect(out).toContain('tcp');
    expect(out).toContain('udp');
  });

  it('returns the query itself when no synonym match', () => {
    const out = expandSynonyms('xyz');
    expect(out).toEqual(['xyz']);
  });

  it('expands in reverse: led includes light', () => {
    const out = expandSynonyms('led');
    expect(out).toContain('led');
    expect(out).toContain('light');
  });

  it('is case-insensitive', () => {
    const out = expandSynonyms('WIFI');
    expect(out).toContain('wifi');
    expect(out).toContain('wireless');
  });

  it('returns empty for empty query', () => {
    expect(expandSynonyms('')).toEqual([]);
  });

  it('covers all defined synonym keys', () => {
    const keys = [
      'wifi',
      'screen',
      'motor',
      'sensor',
      'audio',
      'light',
      'power',
      'time',
    ];
    for (const key of keys) {
      const out = expandSynonyms(key);
      expect(out.length).toBeGreaterThanOrEqual(2);
      expect(out).toContain(key);
    }
  });
});

describe('didYouMean', () => {
  const names = [
    'Adafruit_BusIO',
    'Adafruit_Sensor',
    'ArduinoJson',
    'FastLED',
    'Servo',
  ];

  it('returns null when query has exact-prefix matches', () => {
    expect(didYouMean('Ada', names)).toBeNull();
    expect(didYouMean('Fast', names)).toBeNull();
  });

  it('returns closest fuzzy match when no prefix matches', () => {
    const out = didYouMean('sarvo', names);
    expect(out).toBe('Servo');
  });

  it('returns null for empty query', () => {
    expect(didYouMean('', names)).toBeNull();
  });

  it('returns null for empty names array', () => {
    expect(didYouMean('anything', [])).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(didYouMean('SARVO', names)).toBe('Servo');
  });
});