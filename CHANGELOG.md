# Changelog

All notable changes to this project. Dates are ISO 8601.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased] — 2026-Q2 rewrite

### Changed — full rewrite

**Data pipeline**

- **Replaced** embedded PowerShell pipelines (`.github/workflows/update-libraries.yml`, `weekly-full-enhancement.yml`) with a Node.js 20+/TypeScript pipeline under `pipeline/` and `scripts/pipeline.ts`.
- **Primary source** switched from `repositories.txt` + per-repo GitHub polling to Arduino's [`library_index.json.gz`](https://downloads.arduino.cc/libraries/library_index.json.gz) — a single 5 MB gzipped file containing all 9,600+ libraries and their releases, refreshed by Arduino ~hourly.
- **Conditional GET** on every upstream fetch (ETag + `If-Modified-Since`). A quiet hour costs **1 HTTP call**, not 5,000+.
- **Per-repo ETag** for GitHub enrichment. Repos that haven't changed return 304 and skip enrichment entirely.
- **SHA-based new-vs-updated detection** via `pipeline/src/transforms/diff-detector.ts`. Each release's identity is `sha256Short(archiveFileName + version)`.
- **Deduped by repo** — the index contains 1+ release per repository; the diff detector groups them and emits one `Library` per repo (latest version).
- **V1.5 → V2 migration** via `pipeline/src/transforms/v1-to-v2-migration.ts`. Existing libraries.json (no `first_seen_at`, comma-string `architectures`, etc.) is migrated on every read.

**Output artifacts**

- `output/libraries.json` — schema v2 (was v1.5). New fields: `version_history[]`, `first_seen_at`, `last_seen_sha`, `release_count`, `architectures: string[]`.
- `output/changes.json` — this-run deltas (new / updated / removed), emitted every hourly run.
- `output/stats.json` — category counts, trending, hidden gems, most-depended-on, forgotten classics. Emitted weekly.
- `output/picks.json` — Curated Discoveries payload. Emitted weekly.

**Frontend**

- **Curated Discoveries** replaces the single Staff Pick. Three pick streams:
  - **Editor Picks** from `editors.json` (PR-editable).
  - **Themed Auto-Picks** from `themes.json` (PR-editable; pipeline populates from library DB).
  - **Computed Picks** (algorithmic: New/Updated/Hidden Gems/Trending/Forgotten Classics).
- Subtle on-page attribution (teal spine for editors, gray for themed, NEW/UPDATED badges for computed). No busy "Picked by X" labels.
- **Discovery sort modes** added: Surprise Me (daily-deterministic seed), Hidden Gems, Trending, Forgotten Classics.
- **Smart search**: Levenshtein fuzzy matching for 4+ char queries, synonym expansion (`wifi` → `wireless`/`esp`/…), "Did you mean…?" on zero-result queries.
- **Related Libraries** in the detail modal (replaces alphabetical neighbors). Scored by category, architecture overlap, language, topics, star proximity.
- **Aesthetic tightening**: card font now inherits body monospace (`Courier New`) — was rendering in OS sans-serif because cards are `<button>` elements with browser UA font resets. Cards slightly larger (210×310 vs 180×280).
- **Accessibility**: cards are `<button type="button">` (keyboard-focusable, Enter/Space activation); cards have visible focus rings; modal closes on Escape.
- **archsToArray()** helper — frontend tolerant of both v1 string format and v2 array format for `architectures`.

**Workflows**

- `hourly-sync.yml` — hourly Arduino index fetch + diff (replaces `update-libraries.yml`).
- `daily-enrich.yml` — daily GitHub ETag refresh.
- `weekly-stats.yml` — weekly stats + picks rollup (replaces `weekly-full-enhancement.yml`).
- `pages.yml` — deploys to GitHub Pages on any successful pipeline run or push to main.
- `test.yml` — runs Vitest + Playwright on every PR.

**Removed**

- `staff-pick-config.json` and `STAFF-PICK-CONFIG.md` — replaced by `editors.json`.
- The legacy `update-libraries.yml` and `weekly-full-enhancement.yml` PowerShell workflows.

**Testing**

- **Vitest unit tests**: 125 tests across 7 suites (was zero).
- **Playwright E2E tests**: 25 tests covering home, sort modes, smart search, card layout, modal, visual snapshots.
- **Visual snapshot baselines** for the new UI.

### Fixed

- `library.properties` parser used to produce spurious keys (e.g., `256dpi/arduino-mqtt (`) when `depends` contained commas. New parser rejects malformed keys.
- Frontend `archsToArray()` handles both string and array forms of `architectures`.
- Modal title was rendering at fixed 40px and overflowing on long library names. Now uses `clamp(20px, 4vw, 36px)`.
- `--content-margin-right: 180px` removed (was producing an unexplained right gutter).
- Card layout was producing variable-height internal whitespace due to `flex-grow: 1` on the description. Now centers the description vertically in whatever slot remains.

---

## Earlier history

The repository existed as a static site + PowerShell GitHub Actions for years
before this rewrite. That history isn't tracked here — see `git log` on the
`main` branch before commit `3501756` (Phase 4d + 4e: V1.5→V2 migration +
first live v2 outputs).