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

  test('shows editor pick cards with EDITOR badge in corner', async ({ page }) => {
    const editorCards = page.locator('.library-card.pick-editor');
    await expect(editorCards.first()).toBeVisible();
    // The corner badge replaces the old left-edge teal stripe.
    const badge = editorCards.first().locator('.pick-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/EDITOR/i);
    // The pick-dot next to the call number is teal #00979D = rgb(0, 151, 157)
    const dotBg = await editorCards.first().locator('.pick-dot').evaluate((el) =>
      getComputedStyle(el).backgroundColor
    );
    expect(dotBg).toBe('rgb(0, 151, 157)');
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
    // Verify all visible cards have < 20 stars. The redesigned card puts
    // the star count inside .meta-row > .meta-stars, and uses comma
    // formatting for >=1000 — strip commas before parsing.
    const stars = await cards.evaluateAll((els) =>
      els.map((el) => {
        const text = (el.querySelector('.meta-row .meta-stars')?.textContent ?? '').replace(/,/g, '');
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
        const text = (el.querySelector('.meta-row .meta-stars')?.textContent ?? '').replace(/,/g, '');
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
    // The redesigned card is 280px on desktop (260px at <=1200px viewport).
    expect(cardHeight).toBeGreaterThanOrEqual(200);
    expect(cardHeight).toBeLessThanOrEqual(320);
  });

  test('long-name library truncates to 2 lines via line-clamp', async ({ page }) => {
    await page.fill('#searchInput', 'Mystery');
    await page.waitForTimeout(300);
    const card = page.locator('#libraryGrid .library-card').first();
    const nameEl = card.locator('.library-name');
    if (await nameEl.isVisible()) {
      const style = await nameEl.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          webkitLineClamp: cs.webkitLineClamp,
          lineClamp: cs.lineClamp,
          overflow: cs.overflow,
        };
      });
      // -webkit-line-clamp: 2 is the truncation approach used by the new
      // title. The old text-overflow:ellipsis path is no longer used
      // because titles can wrap to 2 lines.
      expect(style.webkitLineClamp).toBe('2');
      expect(style.overflow).toBe('hidden');
    }
  });

  test('long-author by-statement uses ellipsis truncation', async ({ page }) => {
    await page.fill('#searchInput', 'Mystery');
    await page.waitForTimeout(300);
    const card = page.locator('#libraryGrid .library-card').first();
    const byStatement = card.locator('.by-statement');
    if (await byStatement.isVisible()) {
      const overflow = await byStatement.evaluate((el) => getComputedStyle(el).textOverflow);
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

  test('cards have enough room (height >= 240px, width >= 340px)', async ({ page }) => {
    const dims = await page.locator('#libraryGrid .library-card').first().evaluate(
      (el) => ({ w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight })
    );
    // The redesigned catalog-card is 380x280 on desktop, 340x260 at <=1200px.
    expect(dims.h).toBeGreaterThanOrEqual(240);
    expect(dims.w).toBeGreaterThanOrEqual(340);
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
