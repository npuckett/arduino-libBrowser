import { test, expect } from '@playwright/test';

test.describe('Visual snapshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(
      () => document.getElementById('loading')?.style.display === 'none'
    );
    await page.waitForTimeout(800);
  });

  test('home page above-the-fold (curated + first row of grid)', async ({ page }) => {
    await page.screenshot({
      path: 'tests/e2e/snapshots/home-above-fold.png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1280, height: 900 },
    });
  });

  test('single library card with short description', async ({ page }) => {
    const card = page.locator('.library-card[data-repo-name="adafruit/Adafruit_NeoPixel"]');
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveScreenshot('card-short-description.png', {
      maxDiffPixelRatio: 0.05,
      threshold: 0.3,
    });
  });

  test('curated discoveries section', async ({ page }) => {
    const section = page.locator('#curatedDiscoveries');
    await expect(section).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    await expect(section).toHaveScreenshot('curated-discoveries.png', {
      maxDiffPixelRatio: 0.05,
      threshold: 0.3,
    });
  });

  test('sort bar with active teal button', async ({ page }) => {
    await page.click('[data-sort="hidden-gems"]');
    await page.waitForTimeout(300);
    const sortBar = page.locator('.sort-buttons');
    await expect(sortBar).toHaveScreenshot('sort-bar-teal-active.png', {
      maxDiffPixelRatio: 0.1,
      threshold: 0.3,
    });
  });
});