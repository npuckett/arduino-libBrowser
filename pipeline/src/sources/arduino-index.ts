import { fetchArduinoIndexGz, parseJsonBody } from '../utils/http.js';
import type { ArduinoIndexEntry, SyncState } from '../types.js';

export interface ArduinoIndexFetchResult {
  status: 'unchanged' | 'updated';
  releases: ArduinoIndexEntry[];
}

export interface ArduinoIndexOptions {
  url?: string;
}

const DEFAULT_INDEX_URL =
  'https://downloads.arduino.cc/libraries/library_index.json.gz';

export interface RunMetrics {
  apiCalls: number;
}

export async function fetchArduinoIndex(
  state: SyncState,
  options: ArduinoIndexOptions = {},
  metrics: RunMetrics = { apiCalls: 0 }
): Promise<ArduinoIndexFetchResult> {
  const url = options.url ?? DEFAULT_INDEX_URL;
  metrics.apiCalls += 1;

  const result = await fetchArduinoIndexGz(url, {
    etag: state.lastEtag,
    lastModified: state.lastModified,
  });

  if (result.status === 304) {
    return { status: 'unchanged', releases: [] };
  }

  if (result.status !== 200 || !result.body) {
    throw new Error(
      `Unexpected response fetching Arduino index: status=${result.status}`
    );
  }

  if (result.etag) {
    state.lastEtag = result.etag;
  }
  if (result.lastModified) {
    state.lastModified = result.lastModified;
  }

  const parsed = parseJsonBody<ArduinoIndexEntry[]>(result.body);
  const releases = Array.isArray(parsed) ? parsed : (parsed as unknown as { libraries?: ArduinoIndexEntry[] }).libraries ?? [];

  return { status: 'updated', releases };
}