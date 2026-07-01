import { test, expect } from '@playwright/test';

declare global {
    interface Window {
        __activityHelpers: {
            SPARKLINE_DAYS: number;
            STALE_DAYS: number;
            getLibrarySparklinePoints: (lib: any, today?: Date) => boolean[];
            isStale: (lib: any, today?: Date) => boolean;
            topStarsGainerForWeek: (weekStartISO: string, weekEndISO: string, allLibs: any[]) => any | null;
            lastActiveWeeklyBucket: (weekly: any[]) => any | null;
            categoryTreemapLayout: (slices: any[], boxW: number, boxH: number) => any[];
            daysBetween: (earlierISO: string, laterISO: string) => number;
        };
    }
}

test.describe('Activity helpers (foundation)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForFunction(
            () => document.getElementById('loading')?.style.display === 'none'
        );
        await page.waitForTimeout(500);
    });

    test('window.__activityHelpers is exposed', async ({ page }) => {
        const helpers = await page.evaluate(() => Object.keys(window.__activityHelpers || {}));
        expect(helpers).toEqual(expect.arrayContaining([
            'getLibrarySparklinePoints',
            'isStale',
            'topStarsGainerForWeek',
            'lastActiveWeeklyBucket',
            'categoryTreemapLayout',
            'daysBetween',
        ]));
    });

    test('SPARKLINE_DAYS is 90 and STALE_DAYS is 365', async ({ page }) => {
        const result = await page.evaluate(() => ({
            sp: window.__activityHelpers.SPARKLINE_DAYS,
            st: window.__activityHelpers.STALE_DAYS,
        }));
        expect(result.sp).toBe(90);
        expect(result.st).toBe(365);
    });

    test('daysBetween computes signed day offsets', async ({ page }) => {
        const result = await page.evaluate(() => ({
            a: window.__activityHelpers.daysBetween('2026-06-01', '2026-06-08'),
            b: window.__activityHelpers.daysBetween('2026-06-08', '2026-06-01'),
            c: window.__activityHelpers.daysBetween('2026-06-01', '2026-06-01'),
            d: window.__activityHelpers.daysBetween('not-a-date', '2026-06-01'),
        }));
        expect(result.a).toBe(7);
        expect(result.b).toBe(-7);
        expect(result.c).toBe(0);
        expect(result.d).toBe(-1);
    });

    test('getLibrarySparklinePoints returns 90 booleans marking version days', async ({ page }) => {
        const result = await page.evaluate(() => {
            const today = new Date('2026-07-01T00:00:00Z');
            const lib = { version_history: [
                { version: '1.0.0', seen_at: '2026-06-29' },
                { version: '1.1.0', seen_at: '2026-06-15' },
            ] };
            const points = window.__activityHelpers.getLibrarySparklinePoints(lib, today);
            return {
                len: points.length,
                lastDay: points[points.length - 1],
                twoDaysAgo: points[points.length - 3],
                sixteenDaysAgo: points[points.length - 17],
                middleDay: points[Math.floor(points.length / 2)],
                allBooleans: points.every((p: any) => typeof p === 'boolean'),
            };
        });
        expect(result.len).toBe(90);
        expect(result.allBooleans).toBe(true);
        // Day 2026-06-29 = 2 days before 2026-07-01 → index 89-2 = 87
        expect(result.lastDay).toBe(false);
        expect(result.twoDaysAgo).toBe(true);
        expect(result.sixteenDaysAgo).toBe(true);
        expect(result.middleDay).toBe(false);
    });

    test('isStale is false for libraries updated within a year', async ({ page }) => {
        const result = await page.evaluate(() => {
            const today = new Date('2026-07-01T00:00:00Z');
            return {
                recent: window.__activityHelpers.isStale(
                    { github_updated_at: '2026-06-15', version_history: [] },
                    today
                ),
                midRecent: window.__activityHelpers.isStale(
                    { github_updated_at: '2025-08-01', version_history: [] },
                    today
                ),
                veryOld: window.__activityHelpers.isStale(
                    { github_updated_at: '2024-01-01', version_history: [] },
                    today
                ),
                noHistory: window.__activityHelpers.isStale(
                    { github_updated_at: null, version_history: [] },
                    today
                ),
            };
        });
        expect(result.recent).toBe(false);
        expect(result.midRecent).toBe(false);
        expect(result.veryOld).toBe(true);
        expect(result.noHistory).toBe(false);
    });

    test('topStarsGainerForWeek returns null when no versions in week', async ({ page }) => {
        const result = await page.evaluate(() => {
            return window.__activityHelpers.topStarsGainerForWeek(
                '2026-04-13',
                '2026-04-19',
                [
                    { name: 'old', github_stars: 100, version_history: [
                        { version: '0.1.0', seen_at: '2025-01-01' },
                    ] },
                ]
            );
        });
        expect(result).toBeNull();
    });

    test('topStarsGainerForWeek picks library with versions in the week', async ({ page }) => {
        const result = await page.evaluate(() => {
            return window.__activityHelpers.topStarsGainerForWeek(
                '2026-06-22',
                '2026-06-28',
                [
                    { name: 'a', github_stars: 500, version_history: [
                        { version: '2.0.0', seen_at: '2026-06-25' },
                        { version: '1.0.0', seen_at: '2025-01-01' },
                    ] },
                    { name: 'b', github_stars: 50, version_history: [
                        { version: '0.5.0', seen_at: '2026-06-26' },
                    ] },
                    { name: 'c', github_stars: 50, version_history: [
                        { version: '0.1.0', seen_at: '2025-12-01' },
                    ] },
                ]
            );
        });
        expect(result).not.toBeNull();
        expect(result.name).toBe('a');
    });

    test('lastActiveWeeklyBucket returns most recent bucket with totals > 0', async ({ page }) => {
        const result = await page.evaluate(() => {
            return window.__activityHelpers.lastActiveWeeklyBucket([
                { week_start: '2026-04-13', new: 5, updated: 10 },
                { week_start: '2026-04-20', new: 0, updated: 0 },
                { week_start: '2026-04-27', new: 0, updated: 0 },
                { week_start: '2026-05-04', new: 2, updated: 8 },
            ]);
        });
        expect(result).not.toBeNull();
        expect(result.week_start).toBe('2026-05-04');
    });

    test('categoryTreemapLayout fills the box with non-overlapping cells', async ({ page }) => {
        const result = await page.evaluate(() => {
            const cells = window.__activityHelpers.categoryTreemapLayout(
                [
                    { category: 'A', count: 50 },
                    { category: 'B', count: 30 },
                    { category: 'C', count: 15 },
                    { category: 'D', count: 5 },
                ],
                200,
                100
            );
            const totalArea = cells.reduce((acc: number, c: any) => acc + c.width * c.height, 0);
            const keys = cells.map((c: any) => c.key).sort();
            return { count: cells.length, totalArea, keys };
        });
        expect(result.count).toBe(4);
        expect(result.totalArea).toBeCloseTo(200 * 100, 0);
        expect(result.keys).toEqual(['A', 'B', 'C', 'D']);
    });

    test('categoryTreemapLayout handles empty/sparse input gracefully', async ({ page }) => {
        const result = await page.evaluate(() => {
            return {
                empty: window.__activityHelpers.categoryTreemapLayout([], 100, 100),
                allZero: window.__activityHelpers.categoryTreemapLayout(
                    [{ category: 'X', count: 0 }],
                    100,
                    100
                ),
                zeroBox: window.__activityHelpers.categoryTreemapLayout(
                    [{ category: 'X', count: 10 }],
                    0,
                    0
                ),
            };
        });
        expect(result.empty).toEqual([]);
        expect(result.allZero).toEqual([]);
        expect(result.zeroBox).toEqual([]);
    });
});
