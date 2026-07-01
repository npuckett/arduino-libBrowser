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
});
