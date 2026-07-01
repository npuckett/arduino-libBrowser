# Testing

## Overview

We have two test suites:

| Suite | Tool | Count | Scope |
|-------|------|-------|-------|
| Unit | Vitest | 125 tests across 7 suites | Pipeline transforms, parsers, picks logic |
| E2E | Playwright | 25 tests | Browser-rendered UI + visual snapshots |

See [README.md](../README.md) for the high-level project layout and [PIPELINE.md](./PIPELINE.md) for the broader pipeline/release flow.

## Running tests

### Run all tests

```bash
pnpm test         # unit only (Vitest, ~1s)
pnpm test:e2e     # E2E only (Playwright, ~30s)
pnpm test && pnpm test:e2e   # both
```

### Run a specific test file

```bash
pnpm test pipeline/tests/unit/diff-detector.test.ts
pnpm exec playwright test visual.spec.ts
```

Use `--grep` to narrow by name within a file:

```bash
pnpm test --grep "hidden gems"
pnpm exec playwright test --grep "font"
```

### Update visual snapshots

```bash
pnpm exec playwright test --update-snapshots visual.spec.ts
```

This is destructive — review the diff before committing. See [Visual snapshot baselines](#visual-snapshot-baselines).

### Watch mode

```bash
pnpm test:watch
```

Vitest re-runs impacted tests on save. E2E has no watch mode; re-run `pnpm test:e2e` after edits.

## Unit tests

Located in `pipeline/tests/unit/`. Configured by [vitest.config.ts](../vitest.config.ts) (Node environment, 10 s timeouts, v8 coverage on `pipeline/src/**`).

### What they cover

| File | Tests | Focus |
|------|-------|-------|
| `daily-seed.test.ts` | 10 | Deterministic date-based seeding for surprise-me |
| `computed-picks.test.ts` | 23 | hiddenGems, trending, forgottenClassics, mostDependedOn |
| `diff-detector.test.ts` | 9 | New/updated/unchanged/removed detection (includes regression for dedup bug) |
| `fuzzy-search.test.ts` | 23 | Levenshtein distance, synonym expansion, did-you-mean |
| `parse-library-properties.test.ts` | 19 | Comments, quotes, backslash continuations, malformed keys |
| `theme-picker.test.ts` | 12 | Multi-criteria filtering (categories, architectures, min stars, caps) |
| `v1-to-v2-migration.test.ts` | 29 | V1.5 → V2 schema migration for libraries.json |

The schema migration test (`v1-to-v2-migration.test.ts`) is the most load-bearing — it gates upgrades of the 14.9 MB live data file. Touch it carefully and rerun the E2E suite afterwards.

### Adding a unit test

1. Create `<unit-name>.test.ts` under `pipeline/tests/unit/` (matches the `pipeline/tests/**/*.test.ts` glob in `vitest.config.ts:7`).
2. Import the module and use `describe` / `it` / `expect`. Globals are off, so import them explicitly:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { myFunction } from '../../src/my-module.js';

   describe('myFunction', () => {
     it('returns X when given Y', () => {
       expect(myFunction(Y)).toBe(X);
     });
   });
   ```

3. Use the `pipeline/tests/fixtures/` directory for shared fixture files rather than inlining JSON in the test.
4. Name tests as descriptive sentences — see [Conventions](#conventions).

Run just your new file while iterating:

```bash
pnpm test pipeline/tests/unit/my-module.test.ts
```

## E2E tests

Located in `tests/e2e/specs/`. Configured by [playwright.config.ts](../playwright.config.ts) (Desktop Chrome 1280×800, 30 s timeout, 1 worker).

### How they work

The suite uses a 12-library fixture (`tests/e2e/fixtures/libraries.v2.json`) plus a matching fake `picks.json` so the tests are hermetic and fast — no 14.9 MB download, no network, no flaky upstream data.

[global-setup.ts](../tests/e2e/global-setup.ts) swaps the live `output/libraries.json` and `output/picks.json` for the fixtures before tests run, backing the originals up to `output/*.bak` / `output/*.fix` and `tests/e2e/.backups/`. [global-teardown.ts](../tests/e2e/global-teardown.ts) restores them afterwards (idempotent if setup skipped).

The `webServer` option in `playwright.config.ts:29` auto-starts `node scripts/serve.mjs 8080` for local runs (`reuseExistingServer: true` outside CI). The server reads whatever is in `output/` at start time, which is why fixture swap happens in global-setup before the server boots.

### What they cover

#### `tests/e2e/specs/ui.spec.ts` (21 tests)

| Describe block | Tests | What it verifies |
|----------------|-------|------------------|
| Home page | 5 | Header title, curated discoveries section, editor-pick teal spine, new/updated badges, themed rows |
| Sort modes | 4 | All sort buttons present, hidden-gems filter (< 20 stars), forgotten-classics filter (> 100 stars), surprise-me determinism |
| Search | 3 | Exact match, 1-typo fuzzy match on 4+ char queries, did-you-mean fallback on no-results |
| Library card layout | 5 | Row height uniformity, ellipsis truncation (name + author), monospace font inheritance, minimum card dimensions |
| Modal | 4 | Related libraries (not alphabetical neighbors), attribution reasons, close button, Escape key |

Every `describe` block opens with the same `beforeEach` that navigates to `/index.html` and waits for `#loading` to be hidden.

#### `tests/e2e/specs/visual.spec.ts` (4 tests)

| Snapshot | Source |
|----------|--------|
| `home-above-fold.png` | First 1280×900 px of `/index.html` |
| `card-short-description.png` | Single `.library-card[data-repo-name="adafruit/Adafruit_NeoPixel"]` |
| `curated-discoveries.png` | `#curatedDiscoveries` section |
| `sort-bar-teal-active.png` | `.sort-buttons` after clicking hidden-gems |

The first snapshot uses `page.screenshot()` with a clip; the other three use `toHaveScreenshot()` with `maxDiffPixelRatio: 0.05–0.1` and `threshold: 0.3`. Tolerance is wider than the default to absorb small font rendering differences across machines.

### Visual snapshot baselines

The committed PNGs live in `tests/e2e/specs/visual.spec.ts-snapshots/` (Playwright's default location). They are the source of truth for the visual baseline.

When to regenerate:

- You intentionally change the visual design (e.g. the recent card-size change).
- A library in the fixture changes and that legitimately shifts layout.
- You have confirmed the new output is correct.

Never regenerate without diffing the result first. Steps:

1. `pnpm exec playwright test --update-snapshots visual.spec.ts`
2. `git diff tests/e2e/specs/visual.spec.ts-snapshots/` — read every pixel diff.
3. If anything looks wrong, revert and fix the underlying CSS/HTML before regenerating.

### Adding an E2E test

1. Add a `test('...', ...)` inside an existing `describe` block in `ui.spec.ts`, or create a new spec file under `tests/e2e/specs/`.
2. Use the standard load/wait pattern from existing tests:

   ```ts
   import { test, expect } from '@playwright/test';

   test.describe('My feature', () => {
     test.beforeEach(async ({ page }) => {
       await page.goto('/index.html');
       await page.waitForFunction(
         () => document.getElementById('loading')?.style.display === 'none'
       );
       await page.waitForTimeout(500);
     });

     test('shows the new thing', async ({ page }) => {
       await expect(page.locator('#myThing')).toBeVisible();
     });
   });
   ```

3. Assume the 12-library fixture data — do not depend on real library names that aren't in `libraries.v2.json`. Good fixtures to reference: `FastLED` (display, trending), `Adafruit_NeoPixel` (editor pick), `PubSubClient` (IoT theme), `MysteryLibrary-WithAReallyReallyLongName` (long-name ellipsis case), `LEDMatrix` (hidden gem, 18 stars), `PopularOld` (forgotten classic, 250 stars, updated 2022).
4. For new visual snapshots, add a `toHaveScreenshot()` assertion — but only if the existing snapshots don't already cover the surface. See [Conventions](#conventions).

## CI

`.github/workflows/test.yml` runs on every push to `main` and every PR:

- **Job 1 (unit)**: checkout → install → `pnpm typecheck` → `pnpm lint` → `pnpm test`
- **Job 2 (e2e)**: checkout → install → `pnpm exec playwright install --with-deps chromium` → `pnpm test:e2e`

Playwright report and test-results artifacts are uploaded on every E2E run and retained for 7 days. PR must be green before merge.

## Conventions

- **Test names**: descriptive sentences — `marks a library as updated when the sha changes` (unit), `Escape key closes modal` (E2E).
- **Group related tests** with nested `describe` blocks (see `parse-library-properties.test.ts` for a clean nested example).
- **Fixtures**: keep small (12 libs). Bigger fixtures slow tests without adding coverage. If you need to test a new edge case, prefer extending `tests/e2e/fixtures/libraries.v2.json` with one targeted library over pulling in the 14.9 MB live file.
- **Visual snapshots**: be sparing. Each one is a maintenance burden — every CSS change risks a regenerate-or-investigate cycle.
- **No comments in tests** unless they document a non-obvious regression (e.g. the font-inheritance test in `ui.spec.ts:188` explains why a `<button>` needs explicit font-family).