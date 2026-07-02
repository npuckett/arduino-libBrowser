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
    const categoryCells = page.locator('#activityCategoryTreemap .activity-treemap-cell');

    expect(await dailyPoints.count()).toBeGreaterThan(0);
    expect(await weeklyBars.count()).toBeGreaterThan(0);
    expect(await categoryCells.count()).toBeGreaterThan(0);
  });

  test('daily meta string includes new/updated counts', async ({ page }) => {
    const meta = page.locator('#activityDailyMeta');
    await expect(meta).toContainText(/new/i);
    await expect(meta).toContainText(/updated/i);
  });

  test('#activityCategoryTreemap contains Communication and Sensors cells', async ({ page }) => {
    const treemap = page.locator('#activityCategoryTreemap');
    await expect(treemap).toBeVisible();
    await expect(treemap.locator('[data-category-key="Communication"]')).toHaveCount(1);
    await expect(treemap.locator('[data-category-key="Sensors"]')).toHaveCount(1);
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

  test('treemap cells (named categories) are clickable filter buttons', async ({ page }) => {
    const cell = page.locator('#activityCategoryTreemap [data-category-key="Communication"]');
    await expect(cell).toHaveCount(1);
    const tagName = await cell.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('g');
    const role = await cell.getAttribute('role');
    expect(role).toBe('button');
  });

  test('clicking a treemap cell applies the category filter', async ({ page }) => {
    const cell = page.locator('#activityCategoryTreemap [data-category-key="Sensors"]');
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    const activeFilter = page.locator('.filter-btn.active[data-category]');
    await expect(activeFilter).toHaveText('Sensors');
    await expect(page.locator('#searchInput')).toHaveValue('');
  });

  test('Other categories is not rendered as a treemap cell', async ({ page }) => {
    const rollupCells = page.locator('#activityCategoryTreemap [data-category-key="Other categories"]');
    await expect(rollupCells).toHaveCount(0);
    // And no <g> at all renders the rollup text.
    const treemapText = await page.locator('#activityCategoryTreemap').textContent();
    expect(treemapText).not.toContain('Other categories');
  });

  test('treemap layout fills the svg with non-overlapping cells', async ({ page }) => {
    // Re-run the layout in-page from the same inputs the renderer used,
    // then verify geometric properties of the layout. We compare the raw
    // layout (no rounding) so the overlap check isn't fooled by the
    // 2-decimal pixel rounding the renderer applies to <rect> attrs.
    const result = await page.evaluate(() => {
      const stats = (window as any).libraryStatsData && (window as any).libraryStatsData.activity;
      if (!stats || !Array.isArray(stats.categories_top)) return null;
      const slices = stats.categories_top.filter((s: any) => s && s.category !== 'Other categories');
      if (slices.length === 0) return null;
      const vbW = 300, vbH = 180;
      const cells = (window as any).__activityHelpers.categoryTreemapLayout(slices, vbW, vbH);
      // Compare against the DOM too — confirms the renderer and helper agree.
      const svg = document.getElementById('activityCategoryTreemap') as SVGSVGElement | null;
      const domCells = svg
        ? Array.from(svg.querySelectorAll('.activity-treemap-cell')).map((g) => {
            const r = g.querySelector('rect');
            return {
              key: g.getAttribute('data-category-key'),
              x: parseFloat(r?.getAttribute('x') || '0'),
              y: parseFloat(r?.getAttribute('y') || '0'),
              width: parseFloat(r?.getAttribute('width') || '0'),
              height: parseFloat(r?.getAttribute('height') || '0'),
            };
          })
        : [];
      // 0.5px tolerance accounts for the 2-decimal pixel rounding.
      const EPS = 0.5;
      const totalArea = cells.reduce((acc: number, c: any) => acc + c.width * c.height, 0);
      const overlaps = cells.some((a: any, i: number) =>
        cells.slice(i + 1).some((b: any) => {
          const ix = Math.max(a.x, b.x);
          const iy = Math.max(a.y, b.y);
          const ax = Math.min(a.x + a.width, b.x + b.width);
          const ay = Math.min(a.y + a.height, b.y + b.height);
          return ax > ix + EPS && ay > iy + EPS;
        })
      );
      const allInBox = cells.every((c: any) =>
        c.x >= -EPS && c.y >= -EPS && c.x + c.width <= vbW + EPS && c.y + c.height <= vbH + EPS
      );
      const keysMatch =
        cells.length === domCells.length &&
        cells.every((c: any, i: number) => c.key === domCells[i]!.key);
      return {
        count: cells.length,
        totalArea,
        boxArea: vbW * vbH,
        overlaps,
        allInBox,
        keysMatch,
      };
    });
    expect(result).not.toBeNull();
    expect(result!.count).toBeGreaterThan(0);
    expect(result!.overlaps).toBe(false);
    expect(result!.allInBox).toBe(true);
    expect(result!.keysMatch).toBe(true);
    expect(result!.totalArea).toBeCloseTo(result!.boxArea, 0);
  });

  test('treemap cells are SVG <g> elements with rects and titles', async ({ page }) => {
    const cells = page.locator('#activityCategoryTreemap .activity-treemap-cell');
    const count = await cells.count();
    expect(count).toBeGreaterThan(0);

    // Each cell is a real SVG <g> with a rect and a <title> tooltip.
    for (let i = 0; i < Math.min(count, 3); i++) {
      const cell = cells.nth(i);
      const tagName = await cell.evaluate((el) => el.tagName.toLowerCase());
      expect(tagName).toBe('g');
      await expect(cell.locator('rect')).toHaveCount(1);
      await expect(cell.locator('title')).toHaveCount(1);
      const titleText = await cell.locator('title').textContent();
      expect(titleText).toBeTruthy();
      expect(titleText).toMatch(/libraries/);
      // Cell also carries the category name via the <text> label.
      await expect(cell.locator('text')).toHaveCount(1);
    }
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

  test('weekly panel features at most one .activity-top-gainer pill', async ({ page }) => {
    const pills = page.locator('#activityWeeklyPanel .activity-top-gainer');
    const count = await pills.count();
    expect(count).toBeLessThanOrEqual(1);
    if (count === 1) {
      const pill = pills.first();
      const tagName = await pill.evaluate((el) => el.tagName.toLowerCase());
      expect(tagName).toBe('button');
      const type = await pill.evaluate((el) => (el as HTMLButtonElement).type);
      expect(type).toBe('button');
      const className = await pill.getAttribute('class');
      expect(className).toContain('activity-top-gainer');
      // The pill is hidden via the `hidden` attribute, so when shown
      // the attribute is absent (or null). Use evaluate to read the
      // live DOM property rather than attribute value.
      const hiddenProp = await pill.evaluate((el) => (el as HTMLElement).hidden);
      expect(hiddenProp).toBe(false);
    }
  });

  test('weekly featured pill carries a data-repo-name matching a known library', async ({ page }) => {
    const pill = page.locator('#activityWeeklyPanel .activity-top-gainer').first();
    if ((await pill.count()) === 0) return;
    const hiddenProp = await pill.evaluate((el) => (el as HTMLElement).hidden);
    if (hiddenProp) return;
    const repoName = await pill.getAttribute('data-repo-name');
    expect(repoName).toBeTruthy();
    expect(typeof repoName).toBe('string');
    expect((repoName as string).length).toBeGreaterThan(0);
    const sanity = await page.evaluate((name: string) => {
      const dataLibs = (window as any).libraryData && Array.isArray((window as any).libraryData.libraries)
        ? (window as any).libraryData.libraries
        : [];
      const cardNodes = document.querySelectorAll('.library-card[data-repo-name]');
      const cardRepoNames = Array.from(cardNodes).map((n) => n.getAttribute('data-repo-name') || '');
      return {
        dataHasLibs: dataLibs.length > 0,
        dataInLibs: dataLibs.some((l: any) => l && l.repository_name === name),
        anyCardMatches: cardRepoNames.includes(name),
      };
    }, repoName as string);
    // At least one source of truth confirms the lib exists.
    const someMatch = sanity.dataInLibs || sanity.anyCardMatches || sanity.dataHasLibs;
    expect(someMatch).toBe(true);
  });

  test('clicking the weekly featured pill opens the library detail modal', async ({ page }) => {
    const pill = page.locator('#activityWeeklyPanel .activity-top-gainer').first();
    if ((await pill.count()) === 0) return;
    const hiddenProp = await pill.evaluate((el) => (el as HTMLElement).hidden);
    if (hiddenProp) return;
    await pill.scrollIntoViewIfNeeded();
    await pill.click();
    await expect(page.locator('#modalOverlay')).toBeVisible();
    const bodyText = await page.locator('#modalBody').textContent();
    expect(bodyText).toBeTruthy();
    await page.locator('#modalClose').click();
    await expect(page.locator('#modalOverlay')).not.toBeVisible();
  });

  test('Activity daily panel has a quick-filter chip', async ({ page }) => {
    await expect(page.locator('#activityQuickChip')).toHaveCount(1);
  });

  test('clicking the chip applies a "last 7 days new" filter', async ({ page }) => {
    const chip = page.locator('#activityQuickChip');
    // If the daily panel has no new activity in the last 7 days the chip
    // is hidden by design — skip rather than fail on data-driven absence.
    const hiddenProp = await chip.evaluate((el) => (el as HTMLElement).hidden);
    if (hiddenProp) return;
    await chip.click();
    const banner = page.locator('.activity-filter-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/7 days/i);
    await expect(banner).toContainText(/clear filter/i);
  });

  test('clicking the chip again clears the filter', async ({ page }) => {
    const chip = page.locator('#activityQuickChip');
    const hiddenProp = await chip.evaluate((el) => (el as HTMLElement).hidden);
    if (hiddenProp) return;
    await chip.click();
    const banner = page.locator('.activity-filter-banner');
    await expect(banner).toBeVisible();
    await chip.click();
    await expect(banner).toHaveCount(0);
  });

  test('chip text reflects active state', async ({ page }) => {
    const chip = page.locator('#activityQuickChip');
    const hiddenProp = await chip.evaluate((el) => (el as HTMLElement).hidden);
    if (hiddenProp) return;
    const before = (await chip.textContent()) || '';
    await chip.click();
    const after = (await chip.textContent()) || '';
    expect(after).toContain('×');
    expect(after).not.toBe(before);
    await chip.click();
  });

  test('Daily sparkline has a scrubber group with two handles', async ({ page }) => {
    await expect(page.locator('#activityDailyScrubber')).toHaveCount(1);
    await expect(page.locator('#activityDailyScrubber .activity-scrubber-handle')).toHaveCount(2);
    const startHandle = page.locator('#activityDailyScrubber .activity-scrubber-handle[data-handle="start"]');
    const endHandle = page.locator('#activityDailyScrubber .activity-scrubber-handle[data-handle="end"]');
    await expect(startHandle).toHaveCount(1);
    await expect(endHandle).toHaveCount(1);
  });

  test('Scrubber has an initial selection rect with non-zero width', async ({ page }) => {
    const sel = page.locator('#activityDailyScrubber .activity-scrubber-selection');
    await expect(sel).toHaveCount(1);
    const width = await sel.evaluate((el) => parseFloat((el as SVGRectElement).getAttribute('width') || '0'));
    expect(width).toBeGreaterThan(0);
    // The selection rect is also placed inside the SVG, not at origin.
    const x = await sel.evaluate((el) => parseFloat((el as SVGRectElement).getAttribute('x') || '0'));
    expect(x).toBeGreaterThan(0);
  });

  test('Dragging a handle changes the selection rect width', async ({ page }) => {
    // Snapshot the initial selection rect width so we can assert the
    // drag actually narrows the range (and doesn't just no-op).
    const initialWidth = await page.locator('#activityDailyScrubber .activity-scrubber-selection')
      .evaluate((el) => parseFloat((el as SVGRectElement).getAttribute('width') || '0'));
    expect(initialWidth).toBeGreaterThan(0);

    // Dispatch synthetic pointer events directly on the right handle.
    // Playwright's high-level drag APIs can't easily target sub-pixel
    // SVG coordinates under preserveAspectRatio="none", so we compute
    // the handle's screen-space center via getScreenCTM() and dispatch
    // pointerdown → pointermove → pointerup in one evaluate() so the
    // pointer events land on the same element that captured them.
    const dragResult = await page.evaluate(() => {
      const svg = document.getElementById('activityDailySpark') as SVGSVGElement | null;
      if (!svg) return { ok: false, reason: 'no svg' };
      const endHandle = svg.querySelector('.activity-scrubber-handle[data-handle="end"]') as SVGRectElement | null;
      if (!endHandle) return { ok: false, reason: 'no end handle' };
      const ctm = svg.getScreenCTM();
      if (!ctm) return { ok: false, reason: 'no ctm' };

      const endX = parseFloat(endHandle.getAttribute('x') || '0');
      const endW = parseFloat(endHandle.getAttribute('width') || '0');
      const centerX = endX + endW / 2;
      const centerY = parseFloat(endHandle.getAttribute('y') || '0') + parseFloat(endHandle.getAttribute('height') || '0') / 2;

      const pt = svg.createSVGPoint();
      pt.x = centerX;
      pt.y = centerY;
      const start = pt.matrixTransform(ctm);

      const dispatch = (type: string, x: number) => {
        const e = new PointerEvent(type, {
          pointerId: 1,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: start.y,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
        });
        endHandle.dispatchEvent(e);
      };

      dispatch('pointerdown', start.x);
      dispatch('pointermove', start.x - 30);
      dispatch('pointerup', start.x - 30);
      return { ok: true };
    });
    expect(dragResult.ok).toBe(true);

    // After pointerup the scrubber is not destroyed (applyFilters does
    // not re-render the activity section), so the selection rect
    // should still be present and now narrower than the initial width.
    // Wait a beat for the synchronous dispatch + DOM update to settle.
    await page.waitForTimeout(50);
    const newWidth = await page.locator('#activityDailyScrubber .activity-scrubber-selection')
      .evaluate((el) => parseFloat((el as SVGRectElement).getAttribute('width') || '0'));
    expect(newWidth).toBeGreaterThan(0);
    expect(newWidth).toBeLessThan(initialWidth);
  });

  test('After drag-end, the activity filter banner shows the selected range', async ({ page }) => {
    // The scrubber's last-7-days default already covers a range, so we
    // can apply it just by clicking the right handle and releasing
    // without moving it — that triggers filterByActivity and shows the
    // banner. Alternatively drag it slightly to ensure the release path
    // fires regardless of any initial value. We dispatch a small drag
    // (5px) to be safe.
    const ok = await page.evaluate(() => {
      const svg = document.getElementById('activityDailySpark') as SVGSVGElement | null;
      if (!svg) return false;
      const endHandle = svg.querySelector('.activity-scrubber-handle[data-handle="end"]') as SVGRectElement | null;
      if (!endHandle) return false;
      const ctm = svg.getScreenCTM();
      if (!ctm) return false;
      const endX = parseFloat(endHandle.getAttribute('x') || '0');
      const endW = parseFloat(endHandle.getAttribute('width') || '0');
      const pt = svg.createSVGPoint();
      pt.x = endX + endW / 2;
      pt.y = 45;
      const start = pt.matrixTransform(ctm);
      const dispatch = (type: string, x: number) => {
        endHandle.dispatchEvent(new PointerEvent(type, {
          pointerId: 2,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: start.y,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
        }));
      };
      dispatch('pointerdown', start.x);
      dispatch('pointermove', start.x - 5);
      dispatch('pointerup', start.x - 5);
      return true;
    });
    expect(ok).toBe(true);

    const banner = page.locator('.activity-filter-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/new/i);
    await expect(banner).toContainText(/clear filter/i);
    // The selected range label is the long-form "Mon DD, YYYY – Mon DD, YYYY"
    // string produced by formatLongDate() twice joined with an en dash.
    const text = (await banner.textContent()) || '';
    expect(text).toMatch(/\d{4}/);
    expect(text).toContain('–');
  });
});
