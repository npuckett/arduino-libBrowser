import { describe, it, expect } from 'vitest';

import {
  isV15Library,
  migrateLibrary,
  migrateLibraries,
  readV15File,
  seedStateFromLibraries,
} from '../../src/transforms/v1-to-v2-migration.js';
import { emptyState } from '../../src/utils/state.js';
import { sha256Short } from '../../src/utils/hash.js';
import type { Library, SyncState } from '../../src/types.js';

const FIXED_NOW = new Date('2026-06-30T18:00:00Z');

function v15Sample(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Adafruit_BusIO',
    version: '1.16.0',
    author: 'Adafruit',
    maintainer: 'Adafruit <info@adafruit.com>',
    sentence: 'I2C and SPI abstraction.',
    paragraph: 'A longer paragraph about BusIO.',
    category: 'Sensors',
    architectures: 'avr,esp32,samd',
    depends: 'Wire, SPI (>=1.0)',
    repository_name: 'adafruit/Adafruit_BusIO',
    repository_url: 'https://github.com/adafruit/Adafruit_BusIO',
    processed_at: '2024-01-01T00:00:00Z',
    enhanced_at: '2024-01-02T00:00:00Z',
    enhancement_date: '2024-01-03T00:00:00Z',
    github_stars: 100,
    github_forks: 10,
    github_language: 'C++',
    github_updated_at: '2024-01-04T00:00:00Z',
    license: 'MIT',
    size: 12345,
    url: 'https://github.com/adafruit/Adafruit_BusIO',
    ...overrides,
  };
}

describe('isV15Library', () => {
  it('flags V1.5 records with string architectures', () => {
    expect(isV15Library(v15Sample())).toBe(true);
  });

  it('flags records with no V2 fields even if architectures is already an array', () => {
    const lib = v15Sample({ architectures: ['avr', 'esp32'] });
    expect(isV15Library(lib)).toBe(true);
  });

  it('does not flag V2 records', () => {
    const v2: Partial<Library> = {
      first_seen_at: '2024-01-01T00:00:00Z',
      last_seen_sha: 'abc',
      version_history: [{ version: '1.0.0', seen_at: '2024-01-01T00:00:00Z' }],
      release_count: 1,
    };
    expect(isV15Library(v2)).toBe(false);
  });

  it('returns false for null/non-object input', () => {
    expect(isV15Library(null)).toBe(false);
    expect(isV15Library('string')).toBe(false);
    expect(isV15Library(undefined)).toBe(false);
  });
});

describe('migrateLibrary', () => {
  it('splits comma-separated architectures into an array', () => {
    const lib = migrateLibrary(v15Sample({ architectures: 'avr, esp32 ,samd' }), FIXED_NOW);
    expect(lib.architectures).toEqual(['avr', 'esp32', 'samd']);
  });

  it('passes through array architectures', () => {
    const lib = migrateLibrary(v15Sample({ architectures: ['avr', 'esp32'] }), FIXED_NOW);
    expect(lib.architectures).toEqual(['avr', 'esp32']);
  });

  it('returns empty architectures for missing value', () => {
    const lib = migrateLibrary(v15Sample({ architectures: undefined }), FIXED_NOW);
    expect(lib.architectures).toEqual([]);
  });

  it('splits depends, stripping version constraints and trimming whitespace', () => {
    const lib = migrateLibrary(
      v15Sample({ depends: 'Wire,SPI (>=1.0), Adafruit GFX Library (>=1.11)' }),
      FIXED_NOW
    );
    expect(lib.depends).toEqual(['Wire', 'SPI', 'Adafruit GFX Library']);
  });

  it('returns undefined depends when value is empty string', () => {
    const lib = migrateLibrary(v15Sample({ depends: '' }), FIXED_NOW);
    expect(lib.depends).toBeUndefined();
  });

  it('handles depends as array (already partially-migrated input)', () => {
    const lib = migrateLibrary(v15Sample({ depends: ['Wire', 'SPI'] }), FIXED_NOW);
    expect(lib.depends).toEqual(['Wire', 'SPI']);
  });

  it('handles depends as array of {name} objects', () => {
    const lib = migrateLibrary(
      v15Sample({ depends: [{ name: 'Wire' }, { name: 'SPI (>=1.0)' }] }),
      FIXED_NOW
    );
    expect(lib.depends).toEqual(['Wire', 'SPI']);
  });

  it('uses processed_at for first_seen_at when present', () => {
    const lib = migrateLibrary(
      v15Sample({
        processed_at: '2023-01-01T00:00:00Z',
        enhanced_at: '2024-01-01T00:00:00Z',
        enhancement_date: '2025-01-01T00:00:00Z',
      }),
      FIXED_NOW
    );
    expect(lib.first_seen_at).toBe('2023-01-01T00:00:00Z');
  });

  it('falls back to enhanced_at when processed_at is missing', () => {
    const lib = migrateLibrary(
      v15Sample({
        processed_at: undefined,
        enhanced_at: '2024-01-01T00:00:00Z',
        enhancement_date: '2025-01-01T00:00:00Z',
      }),
      FIXED_NOW
    );
    expect(lib.first_seen_at).toBe('2024-01-01T00:00:00Z');
  });

  it('falls back to enhancement_date when processed_at and enhanced_at are missing', () => {
    const lib = migrateLibrary(
      v15Sample({
        processed_at: undefined,
        enhanced_at: undefined,
        enhancement_date: '2025-01-01T00:00:00Z',
      }),
      FIXED_NOW
    );
    expect(lib.first_seen_at).toBe('2025-01-01T00:00:00Z');
  });

  it('falls back to now when no dates are present', () => {
    const lib = migrateLibrary(
      v15Sample({
        processed_at: undefined,
        enhanced_at: undefined,
        enhancement_date: undefined,
      }),
      FIXED_NOW
    );
    expect(lib.first_seen_at).toBe(FIXED_NOW.toISOString());
  });

  it('computes deterministic last_seen_sha from name+version', () => {
    const lib = migrateLibrary(v15Sample(), FIXED_NOW);
    expect(lib.last_seen_sha).toBe(sha256Short('Adafruit_BusIO-1.16.0.zip|1.16.0'));
  });

  it('populates version_history with one entry and release_count=1', () => {
    const lib = migrateLibrary(v15Sample(), FIXED_NOW);
    expect(lib.version_history).toEqual([
      { version: '1.16.0', seen_at: lib.first_seen_at },
    ]);
    expect(lib.release_count).toBe(1);
  });

  it('copies github metadata when present', () => {
    const lib = migrateLibrary(v15Sample(), FIXED_NOW);
    expect(lib.github_stars).toBe(100);
    expect(lib.github_forks).toBe(10);
    expect(lib.github_language).toBe('C++');
    expect(lib.github_updated_at).toBe('2024-01-04T00:00:00Z');
  });

  it('omits github fields when missing', () => {
    const lib = migrateLibrary(
      v15Sample({
        github_stars: undefined,
        github_forks: undefined,
        github_language: undefined,
        github_updated_at: undefined,
      }),
      FIXED_NOW
    );
    expect(lib.github_stars).toBeUndefined();
    expect(lib.github_forks).toBeUndefined();
    expect(lib.github_language).toBeUndefined();
    expect(lib.github_updated_at).toBeUndefined();
  });

  it('derives repository_name from repository_url when missing', () => {
    const lib = migrateLibrary(
      v15Sample({ repository_name: undefined, repository_url: 'https://github.com/foo/bar' }),
      FIXED_NOW
    );
    expect(lib.repository_name).toBe('foo/bar');
  });

  it('strips .git suffix from repository_url when deriving repository_name', () => {
    const lib = migrateLibrary(
      v15Sample({
        repository_name: undefined,
        repository_url: 'https://github.com/foo/bar.git',
      }),
      FIXED_NOW
    );
    expect(lib.repository_name).toBe('foo/bar');
  });

  it('passes through V2 libraries unchanged', () => {
    const v2: Library = {
      repository_name: 'foo/bar',
      repository_url: 'https://github.com/foo/bar',
      name: 'bar',
      version: '2.0.0',
      version_history: [{ version: '1.0.0', seen_at: '2023-01-01T00:00:00Z' }],
      release_count: 1,
      first_seen_at: '2023-01-01T00:00:00Z',
      last_seen_sha: 'pre-computed-sha',
      author: 'A',
      maintainer: 'A',
      sentence: '',
      paragraph: '',
      category: '',
      architectures: ['avr'],
    };
    expect(migrateLibraries([v2], FIXED_NOW)).toEqual([v2]);
  });
});

describe('readV15File', () => {
  it('migrates a full V1.5 file', () => {
    const file = {
      enhanced_at: '2024-12-01T00:00:00Z',
      total_libraries: 1,
      libraries: [v15Sample()],
    };
    const result = readV15File(file, FIXED_NOW);
    expect(result.libraries).toHaveLength(1);
    expect(result.libraries[0]?.name).toBe('Adafruit_BusIO');
    expect(result.enhancedAtFallback).toBe('2024-12-01T00:00:00Z');
  });

  it('returns empty array when libraries is missing', () => {
    const result = readV15File({ enhanced_at: 'x' }, FIXED_NOW);
    expect(result.libraries).toEqual([]);
    expect(result.enhancedAtFallback).toBe(FIXED_NOW.toISOString());
  });

  it('uses now when enhanced_at is missing', () => {
    const result = readV15File({ libraries: [] }, FIXED_NOW);
    expect(result.enhancedAtFallback).toBe(FIXED_NOW.toISOString());
  });
});

describe('seedStateFromLibraries', () => {
  it('seeds state with firstSeenAt, lastSeenSha, previousVersion, versionHistory', () => {
    const state = emptyState();
    const libs: Library[] = [
      migrateLibrary(v15Sample({ name: 'A', version: '1.0.0', repository_name: 'owner/A' }), FIXED_NOW),
      migrateLibrary(v15Sample({ name: 'B', version: '2.0.0', repository_name: 'owner/B' }), FIXED_NOW),
    ];
    seedStateFromLibraries(state, libs);
    expect(state.firstSeenAt['owner/A']).toBe(libs[0]!.first_seen_at);
    expect(state.firstSeenAt['owner/B']).toBe(libs[1]!.first_seen_at);
    expect(state.lastSeenSha['owner/A']).toBe(libs[0]!.last_seen_sha);
    expect(state.previousVersion['owner/A']).toBe('1.0.0');
    expect(state.previousVersion['owner/B']).toBe('2.0.0');
    expect(state.versionHistory['owner/A']).toEqual(libs[0]!.version_history);
    expect(state.versionHistory['owner/B']).toEqual(libs[1]!.version_history);
    expect(state.knownLibraryCount).toBe(2);
  });

  it('does not overwrite existing state values', () => {
    const state: SyncState = emptyState();
    state.firstSeenAt['owner/A'] = '2020-01-01T00:00:00Z';
    state.lastSeenSha['owner/A'] = 'existing-sha';
    state.previousVersion['owner/A'] = '0.9.0';
    state.versionHistory['owner/A'] = [{ version: '0.9.0', seen_at: '2020-01-01T00:00:00Z' }];

    const lib = migrateLibrary(
      v15Sample({
        name: 'A',
        version: '1.0.0',
        repository_name: 'owner/A',
        processed_at: '2025-01-01T00:00:00Z',
      }),
      FIXED_NOW
    );
    seedStateFromLibraries(state, [lib]);

    expect(state.firstSeenAt['owner/A']).toBe('2020-01-01T00:00:00Z');
    expect(state.lastSeenSha['owner/A']).toBe('existing-sha');
    expect(state.previousVersion['owner/A']).toBe('0.9.0');
  });

  it('skips libraries without a repository_name', () => {
    const state = emptyState();
    const lib = migrateLibrary(
      v15Sample({ name: 'A', version: '1.0.0', repository_name: undefined, repository_url: undefined }),
      FIXED_NOW
    );
    seedStateFromLibraries(state, [lib]);
    expect(Object.keys(state.firstSeenAt)).toHaveLength(0);
  });

  it('updates knownLibraryCount to the input length', () => {
    const state = emptyState();
    state.knownLibraryCount = 999;
    seedStateFromLibraries(state, []);
    expect(state.knownLibraryCount).toBe(0);
  });
});