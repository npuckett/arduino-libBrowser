export type Architecture = string;

export interface Library {
  repository_name: string;
  repository_url: string;
  name: string;
  version: string;
  previous_version?: string;
  version_history: Array<{ version: string; seen_at: string }>;
  release_count: number;
  first_seen_at: string;
  last_seen_sha: string;
  author: string;
  maintainer: string;
  sentence: string;
  paragraph: string;
  category: string;
  architectures: Architecture[];
  github_stars?: number;
  github_forks?: number;
  github_updated_at?: string;
  github_language?: string;
  license?: string;
  depends?: string[];
  download_url?: string;
  size?: number;
}

export interface ArduinoIndexEntry {
  name: string;
  version: string;
  author: string;
  maintainer: string;
  sentence: string;
  paragraph: string;
  category: string;
  architectures: string[];
  types?: string[];
  repository: string;
  url: string;
  archiveFileName: string;
  size: number;
  checksum: string;
  license?: string;
  dependencies?: unknown;
  providesIncludes?: string[];
}

export interface VersionHistoryEntry {
  version: string;
  seen_at: string;
}

export interface SyncState {
  lastEtag?: string;
  lastModified?: string;
  repoEtags: Record<string, string>;
  lastHighWaterMark?: string;
  knownLibraryCount: number;
  firstSeenAt: Record<string, string>;
  lastSeenSha: Record<string, string>;
  previousVersion: Record<string, string>;
  versionHistory: Record<string, VersionHistoryEntry[]>;
}

export interface UpdatedLibraryChange {
  library: Library;
  old_version: string;
  new_version: string;
}

export interface ChangesOutput {
  since: string;
  new_libraries: Library[];
  updated_libraries: UpdatedLibraryChange[];
  removed_libraries: string[];
}

export interface ActivityStats {
  generated_at: string;
  total_libraries: number;
  daily: Array<{ date: string; new: number; updated: number }>;
  weekly: Array<{ week_start: string; new: number; updated: number }>;
  categories_top: Array<{ category: string; count: number; share: number }>;
}

export interface StatsOutput {
  categories: Record<string, number>;
  trending: Library[];
  hidden_gems: Library[];
  most_depended_on: Library[];
  forgotten_classics: Library[];
  activity: ActivityStats;
}

export interface EditorPick {
  library: string;
  picked_at: string;
  note?: string;
}

export interface Editor {
  id: string;
  name: string;
  url: string;
  bio: string;
  picks: EditorPick[];
}

export interface ThemeCriteria {
  categories_any?: string[];
  architectures_any?: string[];
  min_stars?: number;
  exclude_categories?: string[];
}

export interface Theme {
  id: string;
  title: string;
  criteria: ThemeCriteria;
  count: number;
}

export interface PicksComputed {
  new_this_week: Library[];
  updated_this_week: UpdatedLibraryChange[];
  hidden_gems: Library[];
  trending: Library[];
  forgotten_classics: Library[];
}

export interface PicksOutput {
  generated_at: string;
  editors: Editor[];
  themes: Record<string, Library[]>;
  computed: PicksComputed;
}

export interface GitHubRepoMetadata {
  stars: number;
  forks: number;
  language: string;
  updated_at: string;
  topics: string[];
}

export type EnrichedFields = GitHubRepoMetadata | null;

export interface RunStats {
  apiCalls: number;
  rateLimitHits: number;
  unchangedRepos: number;
  updatedRepos: number;
  failedRepos: number;
}