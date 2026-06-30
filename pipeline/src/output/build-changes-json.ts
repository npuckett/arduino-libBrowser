import type {
  ChangesOutput,
  Library,
  UpdatedLibraryChange,
} from '../types.js';

export interface BuildChangesJsonOptions {
  now?: Date;
}

function toChangeEntry(
  lib: Library,
  oldVersion: string | undefined,
  newVersion: string
): UpdatedLibraryChange {
  return {
    library: lib,
    old_version: oldVersion ?? '',
    new_version: newVersion,
  };
}

export function buildChangesJson(
  newLibs: Library[],
  updatedLibs: Library[],
  removedRepos: string[],
  since: string,
  _options: BuildChangesJsonOptions = {}
): ChangesOutput {
  void _options;
  const updatedEntries: UpdatedLibraryChange[] = [];
  for (const lib of updatedLibs) {
    const oldVersion =
      typeof lib.previous_version === 'string' && lib.previous_version.length > 0
        ? lib.previous_version
        : '';
    const newVersion =
      typeof lib.version === 'string' && lib.version.length > 0
        ? lib.version
        : '';
    updatedEntries.push(toChangeEntry(lib, oldVersion, newVersion));
  }

  const sortedNew = [...newLibs].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const sortedUpdatedEntries = [...updatedEntries].sort((a, b) =>
    a.library.name.localeCompare(b.library.name)
  );
  const sortedRemoved = [...removedRepos].sort((a, b) => a.localeCompare(b));

  return {
    since,
    new_libraries: sortedNew,
    updated_libraries: sortedUpdatedEntries,
    removed_libraries: sortedRemoved,
  };
}