import type { Library } from '../types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DailyBucket {
  date: string;
  new: number;
  updated: number;
}

export interface WeeklyBucket {
  week_start: string;
  new: number;
  updated: number;
}

export interface CategorySlice {
  category: string;
  count: number;
  share: number;
}

export interface ActivityStats {
  generated_at: string;
  total_libraries: number;
  daily: DailyBucket[];
  weekly: WeeklyBucket[];
  categories_top: CategorySlice[];
}

export interface BuildActivityStatsOptions {
  now?: number;
  dailyDays?: number;
  weeklyWeeks?: number;
  topCategoryLimit?: number;
  seenAtProvider?: (lib: Library) => string[];
}

function clampLimit(value: number | undefined, fallback: number, max = Number.POSITIVE_INFINITY): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.min(value | 0, max);
}

function toIsoDay(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoMs(value: string | undefined): number | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function startOfIsoWeekMs(ms: number): number {
  const d = new Date(ms);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function defaultSeenAtProvider(lib: Library): string[] {
  if (!Array.isArray(lib.version_history)) return [];
  const out: string[] = [];
  for (const entry of lib.version_history) {
    if (entry && typeof entry.seen_at === 'string' && entry.seen_at.length > 0) {
      out.push(entry.seen_at);
    }
  }
  return out;
}

function buildDailyBuckets(
  libraries: Library[],
  now: number,
  days: number,
  seenAtProvider: (lib: Library) => string[]
): DailyBucket[] {
  const startMs = now - (days - 1) * MS_PER_DAY;
  const startDayMs = Math.floor(startMs / MS_PER_DAY) * MS_PER_DAY;
  const buckets: DailyBucket[] = [];
  for (let i = 0; i < days; i++) {
    buckets.push({ date: toIsoDay(startDayMs + i * MS_PER_DAY), new: 0, updated: 0 });
  }
  const indexByDate = new Map<string, DailyBucket>();
  for (const b of buckets) indexByDate.set(b.date, b);

  const firstSeenSet = new Map<string, number>();
  for (const lib of libraries) {
    const ms = parseIsoMs(lib.first_seen_at);
    if (ms !== null) firstSeenSet.set(lib.repository_name, ms);
  }

  for (const lib of libraries) {
    const firstSeen = firstSeenSet.get(lib.repository_name) ?? null;
    const seen = seenAtProvider(lib);
    for (const s of seen) {
      const ms = parseIsoMs(s);
      if (ms === null) continue;
      if (ms < startDayMs) continue;
      const date = toIsoDay(ms);
      const bucket = indexByDate.get(date);
      if (!bucket) continue;
      if (firstSeen !== null && ms === firstSeen) {
        bucket.new += 1;
      } else {
        bucket.updated += 1;
      }
    }
  }

  return buckets;
}

function buildWeeklyBuckets(
  libraries: Library[],
  now: number,
  weeks: number,
  seenAtProvider: (lib: Library) => string[]
): WeeklyBucket[] {
  const currentWeekStart = startOfIsoWeekMs(now);
  const startWeekStart = currentWeekStart - (weeks - 1) * 7 * MS_PER_DAY;
  const buckets: WeeklyBucket[] = [];
  for (let i = 0; i < weeks; i++) {
    buckets.push({
      week_start: toIsoDay(startWeekStart + i * 7 * MS_PER_DAY),
      new: 0,
      updated: 0,
    });
  }
  const weekIndex = new Map<number, WeeklyBucket>();
  for (let i = 0; i < weeks; i++) {
    const bucket = buckets[i];
    if (bucket) weekIndex.set(startWeekStart + i * 7 * MS_PER_DAY, bucket);
  }

  const firstSeenSet = new Map<string, number>();
  for (const lib of libraries) {
    const ms = parseIsoMs(lib.first_seen_at);
    if (ms !== null) firstSeenSet.set(lib.repository_name, ms);
  }

  for (const lib of libraries) {
    const firstSeen = firstSeenSet.get(lib.repository_name) ?? null;
    const seen = seenAtProvider(lib);
    for (const s of seen) {
      const ms = parseIsoMs(s);
      if (ms === null) continue;
      const ws = startOfIsoWeekMs(ms);
      if (ws < startWeekStart) continue;
      const bucket = weekIndex.get(ws);
      if (!bucket) {
        continue;
      }
      if (firstSeen !== null && ms === firstSeen) {
        bucket.new += 1;
      } else {
        bucket.updated += 1;
      }
    }
  }

  return buckets;
}

function normalizeCategoryKey(value: string): string {
  return value.trim().toLowerCase();
}

function prettifyCategory(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Uncategorized';
  return trimmed
    .split(/\s+/)
    .map((w) => {
      if (w.length === 0) return w;
      const head = w[0];
      if (typeof head !== 'string') return w;
      return head.toUpperCase() + w.slice(1);
    })
    .join(' ');
}

function buildCategorySlices(
  libraries: Library[],
  topLimit: number
): CategorySlice[] {
  const counts = new Map<string, number>();
  for (const lib of libraries) {
    if (typeof lib.category !== 'string') continue;
    const key = normalizeCategoryKey(lib.category);
    if (key.length === 0) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const total = libraries.length > 0 ? libraries.length : 1;
  const sorted = Array.from(counts.entries())
    .map(([k, v]) => ({ key: k, count: v }))
    .sort((a, b) => {
      const diff = b.count - a.count;
      if (diff !== 0) return diff;
      return a.key.localeCompare(b.key);
    });

  const top = sorted.slice(0, topLimit);
  const tail = sorted.slice(topLimit);
  const tailSum = tail.reduce((acc, e) => acc + e.count, 0);

  const slices: CategorySlice[] = top.map((e) => ({
    category: prettifyCategory(e.key),
    count: e.count,
    share: e.count / total,
  }));

  if (tailSum > 0) {
    slices.push({
      category: 'Other categories',
      count: tailSum,
      share: tailSum / total,
    });
  }

  return slices;
}

export function buildActivityStats(
  libraries: Library[],
  options: BuildActivityStatsOptions = {}
): ActivityStats {
  const now = options.now ?? Date.now();
  const dailyDays = clampLimit(options.dailyDays, 30, 365);
  const weeklyWeeks = clampLimit(options.weeklyWeeks, 12, 104);
  const topCategoryLimit = clampLimit(options.topCategoryLimit, 10, 100);
  const seenAtProvider = options.seenAtProvider ?? defaultSeenAtProvider;

  return {
    generated_at: new Date(now).toISOString(),
    total_libraries: libraries.length,
    daily: buildDailyBuckets(libraries, now, dailyDays, seenAtProvider),
    weekly: buildWeeklyBuckets(libraries, now, weeklyWeeks, seenAtProvider),
    categories_top: buildCategorySlices(libraries, topCategoryLimit),
  };
}
