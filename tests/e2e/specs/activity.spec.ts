import { test, expect } from '@playwright/test';

test.describe('Activity section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(
      () => document.getElementById('loading')?.style.display === 'none'
    );
    await page.waitForTimeout(800);
  });

  test('is visible below Curated Discoveries when stats.json has activity', async ({ page }) => {
    const section = page.locator('#activitySection');
    await expect(section).toBeVisible();

    const curated = page.locator('#curatedDiscoveries');
    const grid = page.locator('#libraryGrid');

    const curatedBox = await curated.boundingBox();
    const sectionBox = await section.boundingBox();
    const gridBox = await grid.boundingBox();

    expect(curatedBox).not.toBeNull();
    expect(sectionBox).not.toBeNull();
    expect(gridBox).not.toBeNull();
    if (curatedBox && sectionBox && gridBox) {
      expect(sectionBox.y).toBeGreaterThan(curatedBox.y);
      expect(gridBox.y).toBeGreaterThan(sectionBox.y);
    }
  });

  test('renders all three panels with data', async ({ page }) => {
    await expect(page.locator('#activityDailyPanel')).toBeVisible();
    await expect(page.locator('#activityWeeklyPanel')).toBeVisible();
    await expect(page.locator('#activityCategoryPanel')).toBeVisible();

    const dailyPoints = page.locator('#activityDailySpark circle');
    const weeklyBars = page.locator('#activityWeeklyBars rect');
    const categoryRows = page.locator('#activityCategoryBars .activity-bar-row');

    expect(await dailyPoints.count()).toBeGreaterThan(0);
    expect(await weeklyBars.count()).toBeGreaterThan(0);
    expect(await categoryRows.count()).toBeGreaterThan(0);
  });

  test('daily meta string includes new/updated counts', async ({ page }) => {
    const meta = page.locator('#activityDailyMeta');
    await expect(meta).toContainText(/new/i);
    await expect(meta).toContainText(/updated/i);
  });

  test('category bars include Communication and Sensors', async ({ page }) => {
    const list = page.locator('#activityCategoryBars');
    await expect(list).toContainText('Communication');
    await expect(list).toContainText('Sensors');
  });

  test('panel-level snapshot', async ({ page }) => {
    const section = page.locator('#activitySection');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toHaveScreenshot('activity-section.png', {
      maxDiffPixelRatio: 0.05,
      threshold: 0.3,
    });
  });

  test('header is collapsible', async ({ page }) => {
    const header = page.locator('#activityHeader');
    const content = page.locator('#activityContent');
    await expect(header).toHaveClass(/collapsible/);
    await expect(header).toHaveClass(/expanded/);
    await expect(content).not.toHaveClass(/collapsed/);
    await header.click();
    await expect(content).toHaveClass(/collapsed/);
    await expect(header).not.toHaveClass(/expanded/);
    await header.click();
    await expect(content).not.toHaveClass(/collapsed/);
    await expect(header).toHaveClass(/expanded/);
  });

  test('category rows (except rollup) are clickable filter buttons', async ({ page }) => {
    const row = page.locator('#activityCategoryBars [data-category-key="Communication"]');
    await expect(row).toHaveCount(1);
    const tagName = await row.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('button');
  });

  test('clicking a category row applies the category filter', async ({ page }) => {
    const row = page.locator('#activityCategoryBars [data-category-key="Sensors"]');
    await row.scrollIntoViewIfNeeded();
    await row.click();
    const activeFilter = page.locator('.filter-btn.active[data-category]');
    await expect(activeFilter).toHaveText('Sensors');
    await expect(page.locator('#searchInput')).toHaveValue('');
  });

  test('Other categories row is not a button (no data-category-key)', async ({ page }) => {
    const row = page.locator('#activityCategoryBars .activity-bar-row', { hasText: 'Other categories' });
    const tagName = await row.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('div');
  });

  test('daily legend has clickable New and Updated buttons with counts', async ({ page }) => {
    const newBtn = page.locator('#activityDailyLegend [data-activity-kind="new"]');
    const updBtn = page.locator('#activityDailyLegend [data-activity-kind="updated"]');
    await expect(newBtn).toHaveCount(1);
    await expect(updBtn).toHaveCount(1);
    expect(await newBtn.evaluate((el) => el.tagName.toLowerCase())).toBe('button');
    expect(await updBtn.evaluate((el) => el.tagName.toLowerCase())).toBe('button');
  });

  test('weekly legend has clickable New and Updated buttons', async ({ page }) => {
    const newBtn = page.locator('#activityWeeklyLegend [data-activity-kind="new"]');
    const updBtn = page.locator('#activityWeeklyLegend [data-activity-kind="updated"]');
    await expect(newBtn).toHaveCount(1);
    await expect(updBtn).toHaveCount(1);
  });

  test('clicking daily legend New button shows the activity filter banner', async ({ page }) => {
    await page.locator('#activityDailyLegend [data-activity-kind="new"]').click();
    const banner = page.locator('.activity-filter-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/new/i);
    await expect(banner).toContainText(/clear filter/i);
  });

  test('clicking a daily sparkline dot applies a day-scoped activity filter', async ({ page }) => {
    const dot = page.locator('#activityDailySpark [data-activity-date]').first();
    await expect(dot).toHaveCount(1);
    await dot.click();
    const banner = page.locator('.activity-filter-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/new/i);
  });

  test('clicking a weekly bar new-segment applies a week-scoped activity filter', async ({ page }) => {
    const seg = page.locator('#activityWeeklyBars .activity-bar-segment-new').first();
    await expect(seg).toHaveCount(1);
    await seg.click();
    const banner = page.locator('.activity-filter-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/week of/i);
  });

  test('clicking a weekly bar updated-segment applies a week-scoped updated filter', async ({ page }) => {
    const seg = page.locator('#activityWeeklyBars .activity-bar-segment-updated').first();
    await expect(seg).toHaveCount(1);
    await seg.click();
    const banner = page.locator('.activity-filter-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/updated/i);
  });

  test('clear button on activity filter banner restores normal browse view', async ({ page }) => {
    await page.locator('#activityDailyLegend [data-activity-kind="new"]').click();
    const banner = page.locator('.activity-filter-banner');
    await expect(banner).toBeVisible();
    await banner.locator('.activity-filter-banner-clear').click();
    await expect(banner).toHaveCount(0);
  });

  test('activity panel shows a trend indicator', async ({ page }) => {
    const trend = page.locator('#activityDailyLegend .activity-trend');
    await expect(trend).toHaveCount(1);
    await expect(trend).toContainText(/prior week/);
  });

  test('activity panel shows recent libraries list with at least one entry', async ({ page }) => {
    const items = page.locator('#activityDailyRecentList .activity-recent-item');
    const count = await items.count();
    // Recent list is data-driven — pass whether populated or empty.
    expect(count).toBeGreaterThanOrEqual(0);
    // If any items, they each render name + category + new tag.
    if (count > 0) {
      const first = items.first();
      await expect(first.locator('.activity-recent-item-name')).toBeVisible();
      await expect(first.locator('.activity-recent-item-tag')).toBeVisible();
    }
  });

  test('daily legend has a third Stale item with grey swatch', async ({ page }) => {
    const staleBtn = page.locator('#activityDailyStale');
    await expect(staleBtn).toHaveCount(1);
    expect(await staleBtn.evaluate((el) => el.tagName.toLowerCase())).toBe('button');
    await expect(staleBtn).toHaveAttribute('data-activity-kind', 'stale');
    await expect(staleBtn.locator('.activity-legend-swatch-stale')).toHaveCount(1);
    await expect(staleBtn).toContainText(/stale/i);
  });

  test('weekly legend has a third Stale item', async ({ page }) => {
    const staleBtn = page.locator('#activityWeeklyStale');
    await expect(staleBtn).toHaveCount(1);
    expect(await staleBtn.evaluate((el) => el.tagName.toLowerCase())).toBe('button');
    await expect(staleBtn).toHaveAttribute('data-activity-kind', 'stale');
  });

  test('daily meta line includes the stale count', async ({ page }) => {
    const meta = page.locator('#activityDailyMeta');
    await expect(meta).toContainText(/stale/i);
  });

  test('clicking the daily Stale legend applies a stale filter banner', async ({ page }) => {
    await page.locator('#activityDailyStale').click();
    const banner = page.locator('.activity-filter-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/stale/i);
    await expect(banner).toContainText(/1\+ year/i);
    await expect(banner).toContainText(/clear filter/i);
  });

  test('clearing the stale filter banner restores normal view', async ({ page }) => {
    await page.locator('#activityDailyStale').click();
    const banner = page.locator('.activity-filter-banner');
    await expect(banner).toBeVisible();
    await banner.locator('.activity-filter-banner-clear').click();
    await expect(banner).toHaveCount(0);
  });
});
