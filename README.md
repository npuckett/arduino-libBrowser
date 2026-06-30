# The Arduino Library 
![Arduino Library Browser](images/ArdLib-mainImage.png)

A comprehensive, searchable catalog of 8,000+ Arduino libraries from GitHub, updated automatically and presented through an intuitive web interface.

**Live Site:** [The Arduino Library](https://npuckett.github.io/arduino-libBrowser/)

---

## What is this site?

The Arduino Library Manager allows anyone to create and update libraries that are available through the Arduino IDE. When updating my own libraries in the registry I realized just how many were there and became curious to learn more about them. Unfortunately, I couldn't find a way to search or browse the libraries, so here we are. 



## How Does It Work?
This site takes advantage of the standard data structure required by the Arduino Registry. It polls the full [Arduino Registry](https://github.com/arduino/library-registry/blob/main/repositories.txt) and uses the library properties file along with updated information to generate a json database of the information. A quick update runs nightly with a full re-build weekly.


## How do I use it?

#### **Searching**
- Use the search box to find libraries by keyword, functionality, or author name
- Search looks through library names, descriptions, authors, and categories
- Results are grouped by match type: Library Names, Authors, Categories, and Descriptions
- Use the "Jump to" navigation links to quickly move between search result sections
- Click the "×" button to clear your search and return to browsing mode

#### **Browsing**
- **Browse by Subject**: Expand the "Browse By Subject" section to see categories like "Sensors", "Communication", "Display"
- **Browse by Platform**: Expand the "Browse by Platform" section to filter by Arduino architecture (ESP32, ESP8266, AVR, SAMD, etc.)
- **Toggle Categories**: Click a category or platform button to view only those libraries; click again to return to all libraries


#### **Sorting**
- **Most Recent**: See recently updated libraries (active development) - default view
- **Alphabetical**: Browse libraries A-Z or Z-A
- **Most Popular (Stars)**: Libraries with the most GitHub stars
- **Least Recent**: Oldest libraries (may be outdated)
- **Registry Order**: Random arrangement for discovery
- **Heavily Relied**: Libraries with many dependencies (widely used)

#### **Library Details**
Each library card shows:
- **Name & Version**: Current library version
- **Author**: Library developer (clickable to filter by author)
- **Description**: What the library does
- **Last Updated**: How recently the library was modified
- **GitHub Stars**: Community popularity indicator
- **Category**: Subject classification

#### **Detailed Information**
Click any library card to open a detailed view with:
- **Complete Description**: Full library documentation
- **GitHub Repository**: Direct link to source code
- **Version Information**: Current version and update history
- **Author Details**: Clickable author name to see all their libraries
- **Platform Support**: Supported Arduino architectures
- **Dependencies**: Required libraries (if any)
- **Alphabetical Neighbors**: Discover similar libraries
- **Copy Library Name**: Quick copy button for Arduino IDE installation

#### **Navigation Features**
- **Collapsible Sections**: Click section headers to expand/collapse filter options
- **Sticky Search**: Search box stays visible while scrolling through results
- **Search Navigation**: When searching, use "Jump to" links to navigate between result categories
- **Modal Navigation**: Browse related libraries without leaving the detail view

---

## How does it work?

### Architecture Overview

The Arduino Library Browser is a fully automated system that discovers, processes, and presents Arduino library data through a static web application with automated data pipeline.

### Data Collection & Processing

#### **Registry Synchronization**
- **Official Source**: Downloads the latest library list from [Arduino's Library Registry](https://github.com/arduino/library-registry/blob/main/repositories.txt)
- **Auto-Sync**: Registry is synchronized before each daily update run
- **New Library Detection**: New libraries added to Arduino's registry appear within 24 hours

#### **Automated Discovery**
- **Daily Incremental Updates**: Runs at 2 AM EST (7 AM UTC), processes new and updated libraries (~15-30 minutes)
- **Weekly Full Enhancement**: Runs Sundays at 1 AM EST (6 AM UTC), complete refresh of all library metadata (4-6 hours)
- **Rate Limiting**: Respects GitHub API limits with intelligent retry logic and exponential backoff

#### **Data Enhancement**
- **Library Properties Parsing**: Extracts metadata from `library.properties` files
- **GitHub Integration**: Enriches data with stars, forks, language, and activity metrics
- **Incremental Updates**: Only processes changed libraries for efficiency
- **Skip Logic**: Libraries unchanged for 30+ days are skipped in daily runs

#### **Database Structure**
The system maintains a JSON database containing:
```json
{
  "enhanced_at": "2025-07-30T13:16:00Z",
  "total_libraries": 8027,
  "libraries": [
    {
      "name": "Library Name",
      "version": "1.2.3",
      "author": "Developer Name",
      "sentence": "Brief description",
      "paragraph": "Detailed description",
      "category": "Sensors",
      "architectures": "esp32,esp8266,avr",
      "repository_url": "https://github.com/user/repo",
      "github_stars": 42,
      "github_forks": 7,
      "github_updated_at": "2025-07-29T10:30:00Z",
      "processed_at": "2025-07-30T13:16:15Z"
    }
  ]
}
```

### Technical Implementation

#### **GitHub Actions Automation**
The entire system runs automatically via two GitHub Actions workflows:

| Workflow | Schedule | Duration | Purpose |
|----------|----------|----------|---------|
| `update-libraries.yml` | Daily @ 2 AM EST | ~15-30 min | Sync registry, process new/updated libraries, deploy site |
| `weekly-full-enhancement.yml` | Sundays @ 1 AM EST | 4-6 hours | Full GitHub metadata refresh for all libraries |

- **Error Handling**: Robust retry logic and graceful failure recovery
- **Progress Tracking**: Detailed logging and statistics for monitoring
- **Auto-Deploy**: GitHub Pages automatically updates after each successful run

#### **Web Interface**
- **Static Site**: Pure HTML/CSS/JavaScript for fast loading and reliability
- **GitHub Pages**: Automatically deployed when data updates
- **Client-side Processing**: All filtering and sorting happens in the browser


#### **Core Technologies**
- **GitHub Actions**: Automated workflows with embedded PowerShell for data processing
- **GitHub Pages**: Static site hosting with automatic deployment
- **Vanilla JavaScript**: Lightweight, dependency-free web interface

### Performance & Scalability

#### **Metrics**
- **Library Coverage**: 8,000+ libraries and growing
- **Update Frequency**: Daily incremental, weekly comprehensive
- **API Efficiency**: ~35,000-40,000 GitHub API calls per month (well within limits)
- **Site Speed**: < 2 second load times, client-side filtering for instant results

#### **Reliability**
- **Automated Backups**: Git history preserves all data versions
- **Graceful Degradation**: Site works even with partial data
- **Error Recovery**: Automatic retry logic for temporary failures
- **Monitoring**: GitHub Actions provide detailed execution logs


#### **Issues & Feedback**
Found a bug or have a suggestion? Please [open an issue](https://github.com/npuckett/arduino-libBrowser/issues) on GitHub.

---

## Pipeline

The data pipeline (`scripts/pipeline.ts` + `pipeline/src/*`) is what keeps `output/libraries.json` and `output/picks.json` current. It runs on a three-tier cron schedule and writes only what changed — the hourly run is a no-op when the upstream registry hasn't moved.

### Data sources

| Source | Role | Auth | Notes |
|--------|------|------|-------|
| **`library_index.json.gz`** (`downloads.arduino.cc/libraries/library_index.json.gz`) | **Primary.** The canonical Arduino release index — every library, every release, with `library.properties` metadata. Refreshed by Arduino ~hourly. | None | Conditional GET with ETag + `If-Modified-Since`. 304 means nothing changed. |
| **GitHub REST API** (`/repos/{owner}/{repo}`) | **Secondary enrichment.** Adds `github_stars`, `github_forks`, `github_language`. | `GITHUB_TOKEN` (5,000/h rate limit) | Per-repo ETags stored in `state/sync-state.json`. 304 means the repo metadata is unchanged — most libraries hit 304 every day. |
| `editors.json` | User-editable list of curators and their picks. | None | PR-editable; see [Curated Discoveries](#curated-discoveries) below. |
| `themes.json` | User-editable themed auto-pick configurations. | None | PR-editable. |

### Cron tiers

| Tier | Schedule | Workflow | What it does |
|------|----------|----------|--------------|
| **Hourly sync** | `0 * * * *` | `hourly-sync.yml` | Fetches `library_index.json.gz` with ETag. On 200, re-enriches `libraries.json` + writes `changes.json`. On 304, exits 0 (no deploy). |
| **Daily enrichment** | `0 6 * * *` | `daily-enrich.yml` | Walks `libraries.json` and re-fetches any library whose stored per-repo ETag no longer matches. |
| **Weekly stats** | `0 4 * * 0` | `weekly-stats.yml` | Computes `trending` (stars deltas) and emits `stats.json` + `picks.json` (editors + themes + computed). |
| **Test on PR** | on PR | `test.yml` | Runs Vitest unit tests + Playwright E2E. |

For a one-shot full refresh that ignores ETags, use `pnpm pipeline:hourly -- --full`.

### Running locally

```bash
# Install deps (Node 20+ required)
pnpm install

# One-shot: run all three tiers with --dry-run
pnpm pipeline:dry

# Individual tiers
node --experimental-strip-types scripts/pipeline.ts sync
node --experimental-strip-types scripts/pipeline.ts enrich
node --experimental-strip-types scripts/pipeline.ts stats

# Everything in sequence
node --experimental-strip-types scripts/pipeline.ts all --verbose
```

The script reads `output/libraries.json` + `state/sync-state.json` (created on first run) and writes the same paths.

---

## Curated Discoveries

The home page's Curated Discoveries block surfaces three coordinated pick streams. All three are computed by the pipeline and emitted to `output/picks.json`.

### Editor Picks (manual)

Each editor in **`editors.json`** has a profile (`id`, `name`, `url`, `bio`) and a `picks` array of `{ library, picked_at, note }` entries. The pipeline preserves manual picks — your `picks: [...]` is never overwritten.

**Add yourself as an editor via PR:**

```json
{
  "editors": [
    ...existing editors,
    {
      "id": "your-handle",
      "name": "Your Name",
      "url": "https://github.com/your-handle",
      "bio": "What you build. (one sentence)",
      "picks": [
        {
          "library": "LibraryName",
          "picked_at": "2026-06-30",
          "note": "Why this library is special."
        }
      ]
    }
  ]
}
```

The `library` field must match the library name exactly (case-insensitive). The `picked_at` date determines display order on the home page (newest first).

### Themed Auto-Picks (self-rotating)

Static theme definitions in **`themes.json`**. Each theme has selection criteria (`categories_any`, `architectures_any`, `min_stars`, `exclude_categories`); the pipeline queries the library database and ranks by criteria. Result rotates weekly.

Out of the box the site ships with:

- **IoT** — Communication / Wireless categories, esp32/esp8266/rp2040 architectures
- **Sensors** — category: Sensors
- **Display** — category: Display
- **Motor Control** — Device Control categories
- **Communication** — category: Communication

Add a new theme by appending to the `themes` array.

### Computed Picks (purely algorithmic)

Self-updating picks derived from the data:

| Section | Source | Rule |
|---------|--------|------|
| **New This Week** | `changes.json.new_libraries` | Top 8 by name |
| **Updated This Week** | `changes.json.updated_libraries` | Top 8 by name, shows old → new version |
| **Hidden Gems** | All libraries | stars < 20, updated < 90d, has description |
| **Trending** | Weekly computed | Sort by 7-day star deltas |
| **Forgotten Classics** | All libraries | stars > 100, no update > 365d |

### On-page attribution

Each card carries a subtle attribution badge in the corner or as a colored left-edge accent — editor picks have a teal spine, themed picks a dark gray spine, computed picks show small "NEW" (teal) or "UPDATED" (orange) badges. No busy "Picked by X" labels on cards.

---

## Development

### Tests

```bash
# Unit tests (Vitest, 95 tests across 6 suites)
pnpm test

# E2E tests (Playwright, 19 specs covering home/sort/search/card/modal flows)
pnpm test:e2e

# Both
pnpm test && pnpm test:e2e

# Type check + lint
pnpm typecheck && pnpm lint
```

The E2E suite uses a 12-library fixture (`tests/e2e/fixtures/libraries.v2.json`) so each run is hermetic and fast — no 15MB downloads. `global-setup.ts` swaps in the fixture before the suite runs and `global-teardown.ts` restores the originals.

### Local server

```bash
# Cross-platform (any OS with Node 20+)
node scripts/serve.mjs

# Windows only (legacy)
powershell -ExecutionPolicy Bypass -File ./Start-Server.ps1
```

### Adding a new sort mode

1. Add the algorithm in `pipeline/src/transforms/` (or inline in `index.html` if it's client-only).
2. Add a `<button class="sort-btn" data-sort="…">` in `index.html`.
3. Add a `case '<your-mode>':` to `sortLibraries()`.
4. If it's a pipeline-computed mode, add it to `buildPicksJson` so it surfaces on the home page.

### Adding a new theme

1. Append to the `themes` array in `themes.json` with `id`, `title`, `criteria`, `count`.
2. Push to a branch, open a PR. The next hourly sync will populate the picks for it.

### File layout

```
scripts/
  pipeline.ts                  CLI entry point (sync | enrich | stats | all)
  serve.mjs                    Cross-platform static server for local dev + E2E
pipeline/src/
  sources/
    arduino-index.ts           Fetch + cache library_index.json.gz (ETag-aware)
    github-meta.ts             GitHub repo enrichment with per-repo ETags
  transforms/
    library-properties.ts      Parses library.properties (fixes garbage-key bug)
    diff-detector.ts           SHA-based new / updated / removed detection
    theme-picker.ts            Theme-driven multi-criteria picker
    computed-picks.ts          hidden gems / trending / forgotten classics / most depended on
    fuzzy-search.ts            Levenshtein, synonyms, did-you-mean (also re-used client-side)
    daily-seed.ts              Deterministic date-based seed for Surprise Me
  output/
    build-libraries-json.ts    output/libraries.json (v2 schema)
    build-changes-json.ts      output/changes.json (this-run deltas)
    build-stats-json.ts        output/stats.json (categories, trending, etc.)
    build-picks-json.ts        output/picks.json (editors + themes + computed)
  utils/
    http.ts                    conditionalGet + gzip-aware fetcher
    state.ts                   Atomic load/save of state/sync-state.json
    hash.ts                    FNV-1a hue, charCodeAt daily seed, sha256
    sleep.ts                   Rate-limit-aware backoff
  types.ts                     Library, ArduinoIndexEntry, SyncState, output shapes
pipeline/tests/
  fixtures/                    Sample data for offline tests
  unit/                        Vitest suites
tests/e2e/
  fixtures/                    libraries.v2.json + picks.json for E2E
  specs/ui.spec.ts             19 Playwright tests
  global-setup.ts              Swap fixtures in
  global-teardown.ts           Restore originals
editors.json                   Editor Picks (PR-editable)
themes.json                    Themed Auto-Picks (PR-editable)
index.html                     Static frontend (~1950 lines)
style.css                      Aesthetic (~1050 lines)
```

---

## License

This project is open source. Individual Arduino libraries maintain their own licenses - check each library's repository for specific terms.