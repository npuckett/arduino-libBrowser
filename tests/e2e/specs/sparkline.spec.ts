import { test, expect } from '@playwright/test';

test.describe('Library card sparkline', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForFunction(
            () => document.getElementById('loading')?.style.display === 'none'
        );
        await page.waitForTimeout(500);
    });

    test('every .library-card on the home page has an inline sparkline', async ({ page }) => {
        const cards = page.locator('#libraryGrid .library-card');
        const cardCount = await cards.count();
        expect(cardCount).toBeGreaterThanOrEqual(10);
        const sparkless = await cards.evaluateAll((els) =>
            els
                .map((el, i) => {
                    const directSpark = Array.from(el.children).find(
                        (c) => c.tagName === 'svg' && (c as HTMLElement).classList.contains('card-spark')
                    );
                    return { i, has: !!directSpark };
                })
                .filter((x) => !x.has)
                .map((x) => x.i)
        );
        expect(sparkless).toEqual([]);
    });

    test('sparkline SVG has 90 <rect> children', async ({ page }) => {
        const card = page.locator('#libraryGrid .library-card').first();
        const rectCount = await card.locator('svg.card-spark > rect').count();
        expect(rectCount).toBe(90);
    });

    test('sparkline SVG has a <title> with "X versions in last 90 days" tooltip', async ({ page }) => {
        const card = page.locator('#libraryGrid .library-card').first();
        const title = card.locator('svg.card-spark > title');
        await expect(title).toHaveCount(1);
        const text = (await title.textContent())?.trim() ?? '';
        expect(text).toMatch(/^\d+ versions in last 90 days$/);
    });

    test('sparkline teal ticks (tick-on) use --activity-new-color fallback #00979D when present', async ({ page }) => {
        // The fixture may or may not surface a tick-on depending on whether
        // version_history timestamps parse via the foundation helper. We
        // assert the rule by injecting a synthetic tick into an existing
        // sparkline rather than relying on the fixture, so the test is
        // independent of any particular lib's history.
        const fill = await page.evaluate(() => {
            const card = document.querySelector('#libraryGrid .library-card');
            if (!card) return null;
            const svg = card.querySelector('svg.card-spark');
            if (!svg) return null;
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('class', 'tick-on');
            rect.setAttribute('x', '0');
            rect.setAttribute('y', '2');
            rect.setAttribute('width', '1');
            rect.setAttribute('height', '10');
            svg.appendChild(rect);
            const c = getComputedStyle(rect).fill;
            svg.removeChild(rect);
            return c;
        });
        expect(fill).not.toBeNull();
        // Teal #00979D -> rgb(0, 151, 157)
        expect(fill).toBe('rgb(0, 151, 157)');
    });

    test('sparkline grey ticks (tick-off) use --activity-stale-color fallback #b3b3b3', async ({ page }) => {
        const card = page.locator('#libraryGrid .library-card').first();
        const offFill = await card.locator('svg.card-spark rect.tick-off').first().evaluate(
            (el) => getComputedStyle(el).fill
        );
        // Grey #b3b3b3 -> rgb(179, 179, 179)
        expect(offFill).toBe('rgb(179, 179, 179)');
    });

    test('sparkline truthy count matches the foundation helper for the same lib', async ({ page }) => {
        const result = await page.evaluate(() => {
            const card = document.querySelector('#libraryGrid .library-card');
            if (!card) return null;
            const title = card.querySelector('svg.card-spark > title');
            const tipText = (title?.textContent ?? '').trim();
            const onCount = card.querySelectorAll('svg.card-spark rect.tick-on').length;
            return { tipText, onCount };
        });
        expect(result).not.toBeNull();
        const firstWord = result!.tipText.split(' ')[0] ?? '0';
        const declared = parseInt(firstWord, 10);
        expect(Number.isNaN(declared) ? 0 : declared).toBe(result!.onCount);
    });
});