import { describe, it, expect } from 'vitest';

import { detectChanges } from '../../src/transforms/diff-detector.js';
import { sha256Short } from '../../src/utils/hash.js';
import { emptyState } from '../../src/utils/state.js';
import type { ArduinoIndexEntry, Library, SyncState } from '../../src/types.js';

function makeRelease(overrides: Partial<ArduinoIndexEntry> = {}): ArduinoIndexEntry {
  return {
    name: 'Adafruit_BusIO',
    version: '1.16.1',
    author: 'Adafruit <info@adafruit.com>',
    maintainer: 'Adafruit <info@adafruit.com>',
    sentence: 'I2C and SPI abstraction.',
    paragraph: 'A longer paragraph about BusIO.',
    category: 'Sensors',
    architectures: ['*'],
    types: ['Contributed'],
    repository: 'https://github.com/adafruit/Adafruit_BusIO',
    url: 'https://github.com/adafruit/Adafruit_BusIO/archive/refs/tags/1.16.1.zip',
    archiveFileName: 'Adafruit_BusIO-1.16.1.zip',
    size: 12345,
    checksum: 'SHA-256:abc',
    license: 'MIT',
    dependencies: [],
    providesIncludes: ['Adafruit_I2CDevice.h'],
    ...overrides,
  };
}

function makeLibrary(overrides: Partial<Library>): Library {
  return {
    repository_name: 'adafruit/Adafruit_BusIO',
    repository_url: 'https://github.com/adafruit/Adafruit_BusIO',
    name: 'Adafruit_BusIO',
    version: '1.16.0',
    version_history: [{ version: '1.16.0', seen_at: '2024-01-01T00:00:00Z' }],
    release_count: 1,
    first_seen_at: '2024-01-01T00:00:00Z',
    last_seen_sha: sha256Short('Adafruit_BusIO-1.16.0.zip|1.16.0'),
    author: 'Adafruit',
    maintainer: 'Adafruit',
    sentence: 'I2C and SPI abstraction.',
    paragraph: 'A longer paragraph.',
    category: 'Sensors',
    architectures: ['*'],
    ...overrides,
  };
}

describe('detectChanges', () => {
  it('marks a library as new when state has no firstSeenAt entry', () => {
    const state = emptyState();
    const release = makeRelease();

    const result = detectChanges([], [release], state);

    expect(result.newLibs).toHaveLength(1);
    expect(result.newLibs[0]?.name).toBe('Adafruit_BusIO');
    expect(result.newLibs[0]?.repository_name).toBe(
      'adafruit/Adafruit_BusIO'
    );
    expect(result.updatedLibs).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(state.firstSeenAt['adafruit/Adafruit_BusIO']).toBeDefined();
    expect(state.lastSeenSha['adafruit/Adafruit_BusIO']).toBe(
      sha256Short('Adafruit_BusIO-1.16.1.zip|1.16.1')
    );
    expect(state.previousVersion['adafruit/Adafruit_BusIO']).toBe('1.16.1');
  });

  it('marks a library as updated when the sha changes', () => {
    const state = emptyState();
    const repoName = 'adafruit/Adafruit_BusIO';
    state.firstSeenAt[repoName] = '2024-01-01T00:00:00Z';
    state.lastSeenSha[repoName] = sha256Short(
      'Adafruit_BusIO-1.16.0.zip|1.16.0'
    );
    state.previousVersion[repoName] = '1.16.0';
    state.versionHistory[repoName] = [
      { version: '1.16.0', seen_at: '2024-01-01T00:00:00Z' },
    ];

    const release = makeRelease({ version: '1.16.1' });
    const oldLib = makeLibrary({ version: '1.16.0' });

    const result = detectChanges([oldLib], [release], state);

    expect(result.newLibs).toHaveLength(0);
    expect(result.updatedLibs).toHaveLength(1);
    expect(result.updatedLibs[0]?.version).toBe('1.16.1');
    expect(result.updatedLibs[0]?.previous_version).toBe('1.16.0');
    expect(result.updatedLibs[0]?.version_history).toHaveLength(2);
    expect(state.lastSeenSha[repoName]).toBe(
      sha256Short('Adafruit_BusIO-1.16.1.zip|1.16.1')
    );
    expect(state.previousVersion[repoName]).toBe('1.16.1');
  });

  it('treats a library as unchanged when the sha matches', () => {
    const state = emptyState();
    const repoName = 'adafruit/Adafruit_BusIO';
    state.firstSeenAt[repoName] = '2024-01-01T00:00:00Z';
    state.lastSeenSha[repoName] = sha256Short(
      'Adafruit_BusIO-1.16.0.zip|1.16.0'
    );
    state.previousVersion[repoName] = '1.16.0';
    state.versionHistory[repoName] = [
      { version: '1.16.0', seen_at: '2024-01-01T00:00:00Z' },
    ];

    const release = makeRelease({
      version: '1.16.0',
      archiveFileName: 'Adafruit_BusIO-1.16.0.zip',
    });
    const oldLib = makeLibrary({ version: '1.16.0' });

    const result = detectChanges([oldLib], [release], state);

    expect(result.newLibs).toHaveLength(0);
    expect(result.updatedLibs).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('reports removed libraries that exist in old but not in new', () => {
    const state = emptyState();
    const oldLibs: Library[] = [
      makeLibrary({
        repository_name: 'old/deleted-repo',
        name: 'DeletedRepo',
        version: '0.1.0',
        last_seen_sha: sha256Short('DeletedRepo-0.1.0.zip|0.1.0'),
      }),
      makeLibrary({
        repository_name: 'kept/keep-this',
        name: 'KeepThis',
        version: '0.2.0',
        last_seen_sha: sha256Short('KeepThis-0.2.0.zip|0.2.0'),
      }),
    ];
    state.firstSeenAt['old/deleted-repo'] = '2023-01-01T00:00:00Z';
    state.lastSeenSha['old/deleted-repo'] = sha256Short(
      'DeletedRepo-0.1.0.zip|0.1.0'
    );
    state.firstSeenAt['kept/keep-this'] = '2023-02-01T00:00:00Z';
    state.lastSeenSha['kept/keep-this'] = sha256Short(
      'KeepThis-0.2.0.zip|0.2.0'
    );
    state.previousVersion['kept/keep-this'] = '0.2.0';

    const keepRelease = makeRelease({
      name: 'KeepThis',
      version: '0.2.0',
      archiveFileName: 'KeepThis-0.2.0.zip',
      repository: 'https://github.com/kept/keep-this',
    });

    const result = detectChanges(oldLibs, [keepRelease], state);

    expect(result.removed).toEqual(['old/deleted-repo']);
    expect(result.newLibs).toHaveLength(0);
    expect(result.updatedLibs).toHaveLength(0);
  });

  it('handles multiple new libraries in a single batch', () => {
    const state = emptyState();
    const releaseA = makeRelease({
      name: 'Library_A',
      repository: 'https://github.com/example/library_a',
      archiveFileName: 'Library_A-0.1.0.zip',
      version: '0.1.0',
    });
    const releaseB = makeRelease({
      name: 'Library_B',
      repository: 'https://github.com/example/library_b',
      archiveFileName: 'Library_B-0.2.0.zip',
      version: '0.2.0',
    });
    const releaseC = makeRelease({
      name: 'Library_C',
      repository: 'https://github.com/example/library_c',
      archiveFileName: 'Library_C-1.0.0.zip',
      version: '1.0.0',
    });

    const result = detectChanges([], [releaseA, releaseB, releaseC], state);

    expect(result.newLibs).toHaveLength(3);
    expect(result.newLibs.map((l) => l.name).sort()).toEqual(
      ['Library_A', 'Library_B', 'Library_C'].sort()
    );
    expect(state.firstSeenAt['example/library_a']).toBeDefined();
    expect(state.firstSeenAt['example/library_b']).toBeDefined();
    expect(state.firstSeenAt['example/library_c']).toBeDefined();
  });

  it('handles a mixed batch with new, updated, and unchanged libraries', () => {
    const state: SyncState = emptyState();
    const repoA = 'example/library_a';
    const repoB = 'example/library_b';
    const repoC = 'example/library_c';

    state.firstSeenAt[repoA] = '2024-01-01T00:00:00Z';
    state.lastSeenSha[repoA] = sha256Short('Library_A-1.0.0.zip|1.0.0');
    state.previousVersion[repoA] = '1.0.0';
    state.versionHistory[repoA] = [{ version: '1.0.0', seen_at: '2024-01-01T00:00:00Z' }];

    state.firstSeenAt[repoB] = '2024-01-01T00:00:00Z';
    state.lastSeenSha[repoB] = sha256Short('Library_B-2.0.0.zip|2.0.0');
    state.previousVersion[repoB] = '2.0.0';
    state.versionHistory[repoB] = [{ version: '2.0.0', seen_at: '2024-01-01T00:00:00Z' }];

    const oldLibs: Library[] = [
      makeLibrary({
        repository_name: repoA,
        name: 'Library_A',
        version: '1.0.0',
        last_seen_sha: sha256Short('Library_A-1.0.0.zip|1.0.0'),
        first_seen_at: '2024-01-01T00:00:00Z',
      }),
      makeLibrary({
        repository_name: repoB,
        name: 'Library_B',
        version: '2.0.0',
        last_seen_sha: sha256Short('Library_B-2.0.0.zip|2.0.0'),
        first_seen_at: '2024-01-01T00:00:00Z',
      }),
    ];

    const releaseUnchangedA = makeRelease({
      name: 'Library_A',
      repository: `https://github.com/${repoA}`,
      archiveFileName: 'Library_A-1.0.0.zip',
      version: '1.0.0',
    });
    const releaseUpdatedB = makeRelease({
      name: 'Library_B',
      repository: `https://github.com/${repoB}`,
      archiveFileName: 'Library_B-2.1.0.zip',
      version: '2.1.0',
    });
    const releaseNewC = makeRelease({
      name: 'Library_C',
      repository: `https://github.com/${repoC}`,
      archiveFileName: 'Library_C-0.1.0.zip',
      version: '0.1.0',
    });

    const result = detectChanges(
      oldLibs,
      [releaseUnchangedA, releaseUpdatedB, releaseNewC],
      state
    );

    expect(result.newLibs).toHaveLength(1);
    expect(result.newLibs[0]?.name).toBe('Library_C');
    expect(result.updatedLibs).toHaveLength(1);
    expect(result.updatedLibs[0]?.name).toBe('Library_B');
    expect(result.updatedLibs[0]?.version).toBe('2.1.0');
    expect(result.updatedLibs[0]?.previous_version).toBe('2.0.0');
    expect(result.removed).toHaveLength(0);

    expect(state.lastSeenSha[repoA]).toBe(
      sha256Short('Library_A-1.0.0.zip|1.0.0')
    );
    expect(state.lastSeenSha[repoB]).toBe(
      sha256Short('Library_B-2.1.0.zip|2.1.0')
    );
    expect(state.lastSeenSha[repoC]).toBe(
      sha256Short('Library_C-0.1.0.zip|0.1.0')
    );
    expect(state.versionHistory[repoB]).toHaveLength(2);
  });

  it('handles repositories with .git suffix in URL', () => {
    const state = emptyState();
    const release = makeRelease({
      repository: 'https://github.com/example/test.git',
    });
    const result = detectChanges([], [release], state);
    expect(result.newLibs[0]?.repository_name).toBe('example/test');
  });

  it('returns empty arrays when no releases are given', () => {
    const state = emptyState();
    const result = detectChanges([], [], state);
    expect(result).toEqual({ newLibs: [], updatedLibs: [], removed: [] });
  });

  it('deduplicates multiple releases of the same repository to a single Library', () => {
    // Regression test: the Arduino index contains 1+ release per repository
    // (one per tagged version). The detector must NOT emit one Library per
    // release — it groups by repository and emits one Library for the
    // highest version.
    const state = emptyState();
    const repoName = 'adafruit/Adafruit_BusIO';
    const oldLib = makeLibrary({
      repository_name: repoName,
      name: 'Adafruit_BusIO',
      version: '1.15.0',
      last_seen_sha: sha256Short('Adafruit_BusIO-1.15.0.zip|1.15.0'),
      first_seen_at: '2023-01-01T00:00:00Z',
    });
    state.firstSeenAt[repoName] = '2023-01-01T00:00:00Z';
    state.lastSeenSha[repoName] = sha256Short('Adafruit_BusIO-1.15.0.zip|1.15.0');
    state.previousVersion[repoName] = '1.15.0';
    state.versionHistory[repoName] = [
      { version: '1.15.0', seen_at: '2023-01-01T00:00:00Z' },
    ];

    const releases = [
      makeRelease({ version: '1.15.1', archiveFileName: 'Adafruit_BusIO-1.15.1.zip' }),
      makeRelease({ version: '1.16.0', archiveFileName: 'Adafruit_BusIO-1.16.0.zip' }),
      makeRelease({ version: '1.16.1', archiveFileName: 'Adafruit_BusIO-1.16.1.zip' }),
    ];

    const result = detectChanges([oldLib], releases, state);

    expect(result.newLibs).toHaveLength(0);
    expect(result.updatedLibs).toHaveLength(1);
    expect(result.updatedLibs[0]?.version).toBe('1.16.1');
    expect(result.updatedLibs[0]?.previous_version).toBe('1.15.0');
  });
});