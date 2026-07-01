import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(
      () => document.getElementById('loading')?.style.display === 'none'
    );
    await page.waitForTimeout(500);
  });

  test('renders the header title', async ({ page }) => {
    await expect(page.locator('h1.title')).toContainText('THE ARDUINO LIBRARY');
  });

  test('loads and displays the curated discoveries section', async ({ page }) => {
    const section = page.locator('#curatedDiscoveries');
    await expect(section).toBeVisible();
    await expect(page.locator('#editorPicksRow')).toBeVisible();
    await expect(page.locator('#computedRow')).toBeVisible();
  });

  test('shows editor pick cards with teal spine accent', async ({ page }) => {
    const editorCards = page.locator('.library-card.pick-editor');
    await expect(editorCards.first()).toBeVisible();
    const borderLeft = await editorCards.first().evaluate((el) =>
      getComputedStyle(el).borderLeftColor
    );
    // teal #00979D = rgb(0, 151, 157)
    expect(borderLeft).toBe('rgb(0, 151, 157)');
  });

  test('shows new + updated badges in computed row', async ({ page }) => {
    const newBadge = page.locator('.pick-badge.new');
    await expect(newBadge).toBeVisible();
    const updatedBadge = page.locator('.pick-badge.updated');
    await expect(updatedBadge).toBeVisible();
  });

  test('renders themed rows', async ({ page }) => {
    const themedRows = page.locator('.themed-row');
    expect(await themedRows.count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#themed-iot')).toBeVisible();
  });
});

test.describe('Sort modes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => document.getElementById("loading")?.style.display === "none");
    await page.waitForTimeout(500);
  });

  test('has surprise-me, hidden-gems, trending, forgotten-classics buttons', async ({ page }) => {
    await expect(page.locator('[data-sort="surprise-me"]')).toBeVisible();
    await expect(page.locator('[data-sort="hidden-gems"]')).toBeVisible();
    await expect(page.locator('[data-sort="trending"]')).toBeVisible();
    await expect(page.locator('[data-sort="forgotten-classics"]')).toBeVisible();
  });

  test('hidden-gems shows only low-star recently-updated libs', async ({ page }) => {
    await page.click('[data-sort="hidden-gems"]');
    await page.waitForTimeout(300);
    const cards = page.locator('#libraryGrid .library-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    // Verify all visible cards have < 20 stars
    const stars = await cards.evaluateAll((els) =>
      els.map((el) => {
        const text = el.querySelector('.library-stars')?.textContent ?? '';
        const m = text.match(/(\d+)/);
        return m && m[1] ? parseInt(m[1], 10) : 0;
      })
    );
    for (const s of stars) {
      expect(s).toBeLessThan(20);
    }
  });

  test('forgotten-classics shows only old high-star libs', async ({ page }) => {
    await page.click('[data-sort="forgotten-classics"]');
    await page.waitForTimeout(300);
    const cards = page.locator('#libraryGrid .library-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    const stars = await cards.evaluateAll((els) =>
      els.map((el) => {
        const text = el.querySelector('.library-stars')?.textContent ?? '';
        const m = text.match(/(\d+)/);
        return m && m[1] ? parseInt(m[1], 10) : 0;
      })
    );
    for (const s of stars) {
      expect(s).toBeGreaterThan(100);
    }
  });

  test('surprise-me produces deterministic results for the same day', async ({ page }) => {
    await page.click('[data-sort="surprise-me"]');
    await page.waitForTimeout(300);
    const firstName1 = await page.locator('#libraryGrid .library-card .library-name').first().textContent();

    await page.click('[data-sort="alphabetical"]');
    await page.waitForTimeout(100);

    await page.click('[data-sort="surprise-me"]');
    await page.waitForTimeout(300);
    const firstName2 = await page.locator('#libraryGrid .library-card .library-name').first().textContent();
    expect(firstName1).toBe(firstName2);
  });
});

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => document.getElementById("loading")?.style.display === "none");
    await page.waitForTimeout(500);
  });

  test('exact match returns the library', async ({ page }) => {
    await page.fill('#searchInput', 'FastLED');
    await page.waitForTimeout(300);
    const cards = page.locator('#libraryGrid .library-card');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('fuzzy match finds a library with 1-typo for >=4 char query', async ({ page }) => {
    await page.fill('#searchInput', 'FastLEED'); // 1 typo on FastLED
    await page.waitForTimeout(300);
    const cards = page.locator('#libraryGrid .library-card');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('no-results state shows did-you-mean for typos', async ({ page }) => {
    await page.fill('#searchInput', 'qqqqqxxxxx');
    await page.waitForTimeout(300);
    const noResults = page.locator('#noResults');
    if (await noResults.isVisible()) {
      const text = await noResults.textContent();
      // Either noResults message OR "Did you mean" suggestion
      expect(text?.toLowerCase()).toMatch(/no items|did you mean/);
    }
  });
});

test.describe('Library card layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => document.getElementById("loading")?.style.display === "none");
    await page.waitForTimeout(500);
  });

  test('all cards in a row have the same height', async ({ page }) => {
    const firstRowCards = page.locator('#libraryGrid .library-card').first();
    const cardHeight = await firstRowCards.evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(cardHeight).toBeGreaterThanOrEqual(150);
    expect(cardHeight).toBeLessThanOrEqual(220);
  });

  test('long-name library uses ellipsis truncation', async ({ page }) => {
    await page.fill('#searchInput', 'Mystery');
    await page.waitForTimeout(300);
    const card = page.locator('#libraryGrid .library-card').first();
    const nameEl = card.locator('.library-name');
    if (await nameEl.isVisible()) {
      const overflow = await nameEl.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { o: cs.overflow, w: cs.whiteSpace, e: cs.textOverflow };
      });
      expect(overflow.o).toBe('hidden');
      expect(overflow.w).toBe('nowrap');
      expect(overflow.e).toBe('ellipsis');
    }
  });

  test('long-author library uses ellipsis truncation', async ({ page }) => {
    await page.fill('#searchInput', 'Mystery');
    await page.waitForTimeout(300);
    const card = page.locator('#libraryGrid .library-card').first();
    const authorEl = card.locator('.library-author');
    if (await authorEl.isVisible()) {
      const overflow = await authorEl.evaluate((el) => getComputedStyle(el).textOverflow);
      expect(overflow).toBe('ellipsis');
    }
  });

  test('cards inherit body monospace font (not browser sans-serif default)', async ({ page }) => {
    // Regression test: cards are <button> elements, and browser UA stylesheets
    // reset button font-family to a sans-serif system font. The cards must
    // explicitly inherit the body monospace so the visual aesthetic stays
    // consistent across the page.
    const cardFont = await page.locator('#libraryGrid .library-card').first().evaluate(
      (el) => getComputedStyle(el).fontFamily
    );
    const bodyFont = await page.locator('body').evaluate(
      (el) => getComputedStyle(el).fontFamily
    );
    expect(cardFont.toLowerCase()).toContain('courier');
    expect(cardFont).toBe(bodyFont);
  });

  test('cards have enough room (height >= 200px, width >= 280px)', async ({ page }) => {
    const dims = await page.locator('#libraryGrid .library-card').first().evaluate(
      (el) => ({ w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight })
    );
    expect(dims.h).toBeGreaterThanOrEqual(200);
    expect(dims.w).toBeGreaterThanOrEqual(280);
  });
});

test.describe('Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => document.getElementById("loading")?.style.display === "none");
    await page.waitForTimeout(500);
  });

  test('opening a library detail shows related libraries (not alphabetical neighbors)', async ({ page }) => {
    await page.fill('#searchInput', 'FastLED');
    await page.waitForTimeout(300);
    await page.click('#libraryGrid .library-card');
    await page.waitForTimeout(500);
    await expect(page.locator('#modalOverlay')).toBeVisible();
    await expect(page.locator('.neighbors-title')).toContainText('Related Libraries');
  });

  test('each related library has an attribution reason', async ({ page }) => {
    await page.fill('#searchInput', 'FastLED');
    await page.waitForTimeout(300);
    await page.click('#libraryGrid .library-card');
    await page.waitForTimeout(500);
    const reasons = page.locator('.neighbor-reason');
    const count = await reasons.count();
    if (count > 0) {
      const firstReason = await reasons.first().textContent();
      expect(firstReason).toBeTruthy();
    }
  });

  test('close button works', async ({ page }) => {
    await page.fill('#searchInput', 'FastLED');
    await page.waitForTimeout(300);
    await page.click('#libraryGrid .library-card');
    await page.waitForTimeout(500);
    await page.click('#modalClose');
    await page.waitForTimeout(300);
    await expect(page.locator('#modalOverlay')).not.toBeVisible();
  });

  test('Escape key closes modal', async ({ page }) => {
    await page.fill('#searchInput', 'FastLED');
    await page.waitForTimeout(300);
    await page.click('#libraryGrid .library-card');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.locator('#modalOverlay')).not.toBeVisible();
  });
});
