import type { Library, SyncState } from '../types.js';

export interface LibrariesJsonStats {
  total_categories: number;
  total_architectures: number;
  with_github_metadata: number;
  total_dependencies: number;
}

export interface LibrariesJsonOutput {
  version: 2;
  enhanced_at: string;
  total_libraries: number;
  index_etag: string;
  index_last_modified: string;
  libraries: Library[];
  stats: LibrariesJsonStats;
}

export interface BuildLibrariesJsonOptions {
  now?: Date;
  state?: SyncState;
}

function stripSingleVersionPrevious(libraries: Library[]): Library[] {
  const out: Library[] = [];
  for (const lib of libraries) {
    if (!lib) {
      continue;
    }
    const historyLen = Array.isArray(lib.version_history)
      ? lib.version_history.length
      : 0;
    if (historyLen <= 1 && lib.previous_version !== undefined) {
      const { previous_version: _omit, ...rest } = lib;
      void _omit;
      out.push(rest as Library);
    } else {
      out.push(lib);
    }
  }
  return out;
}

function buildStats(libraries: Library[]): LibrariesJsonStats {
  const categories = new Set<string>();
  const architectures = new Set<string>();
  let withGithub = 0;
  let totalDependencies = 0;

  for (const lib of libraries) {
    if (typeof lib.category === 'string' && lib.category.trim().length > 0) {
      categories.add(lib.category.trim().toLowerCase());
    }
    if (Array.isArray(lib.architectures)) {
      for (const arch of lib.architectures) {
        if (typeof arch === 'string' && arch.length > 0) {
          architectures.add(arch);
        }
      }
    }
    if (typeof lib.github_stars === 'number') {
      withGithub += 1;
    }
    if (Array.isArray(lib.depends)) {
      totalDependencies += lib.depends.length;
    }
  }

  return {
    total_categories: categories.size,
    total_architectures: architectures.size,
    with_github_metadata: withGithub,
    total_dependencies: totalDependencies,
  };
}

export function buildLibrariesJson(
  libraries: Library[],
  options: BuildLibrariesJsonOptions = {}
): LibrariesJsonOutput {
  const now = options.now ?? new Date();
  const sorted = [...libraries].sort((a, b) => {
    return a.name.localeCompare(b.name);
  });
  const stripped = stripSingleVersionPrevious(sorted);
  const stats = buildStats(stripped);

  return {
    version: 2,
    enhanced_at: now.toISOString(),
    total_libraries: stripped.length,
    index_etag: options.state?.lastEtag ?? '',
    index_last_modified: options.state?.lastModified ?? '',
    libraries: stripped,
    stats,
  };
}