/**
 * Self-contained Library interface for the MCP server.
 *
 * Mirrors the relevant subset of the `Library` type from the main project's
 * `pipeline/src/types.ts`, trimmed to only the fields used for search/display.
 * Kept independent so this package builds and publishes on its own.
 */
export interface Library {
  name: string;
  version: string;
  author: string;
  maintainer: string;
  sentence: string;
  paragraph: string;
  category: string;
  architectures: string[];
  repository_name: string;
  repository_url: string;
  depends?: string[];
  github_stars?: number;
  github_forks?: number;
  github_language?: string;
  github_updated_at?: string;
  license?: string;
  download_url?: string;
  size?: number;
}

/** Top-level shape of output/libraries.json from thearduinolibrary.com. */
export interface LibrariesIndex {
  version: number;
  enhanced_at?: string;
  total_libraries?: number;
  libraries: Library[];
}
