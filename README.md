# The Arduino Library

![Arduino Library Browser](images/ArdLib-mainImage.png)

A searchable, self-updating catalog of every library in the Arduino Library
Manager — curated picks, fuzzy search, related libraries, and theme browsing
for serendipitous discovery.

**Live site:** https://thearduinolibrary.com/

---

## What is this?

The [Arduino Library Manager](https://docs.arduino.cc/libraries/) lets anyone
publish libraries for the Arduino IDE. There are over 9,500 of them and no
built-in way to browse or search across the catalog.

This site fixes that. It polls Arduino's release index hourly, enriches each
library with GitHub metadata, and presents the result through a brutalist
black-and-white UI designed for keyboard navigation and clean discovery.

---

## How to use it

### Search

Type into the search box. The matcher scans names, authors, categories,
maintainers, and descriptions. Results are bucketed by match type with "Jump
to" navigation between sections.

The matcher is **fuzzy** (tolerates 1-character typos on 4+ character queries)
and **synonym-aware** (`wifi` also matches `wireless`/`esp`/`network`;
`screen` matches `display`/`lcd`/`oled`/`tft`; etc.). A "Did you mean…?"
suggestion appears for zero-result queries.

### Browse

- **Curated Discoveries** (top of page): three pick streams — Editor Picks,
  themed rows (IoT, Sensors, Display, Motor Control, Communication), and
  This Week's new/updated libraries.
- **Browse By Subject**: click to filter by category (Sensors,
  Communication, Display, …).
- **Browse By Platform**: click to filter by architecture (avr, esp32,
  esp8266, samd, …).

Click a filter again to clear it.

### Sort

The toolbar offers:

| Sort | What it shows |
|------|---------------|
| **Recent Updates** (default) | Recently updated libraries |
| **New Additions** | Recently added to the registry |
| **Alphabetical (A-Z / Z-A)** | By name |
| **Most Popular** | By GitHub stars |
| **Heavily Relied** | Libraries that many others depend on |
| **Surprise Me** | Daily-deterministic quality pick, lifted to position 1 |
| **Hidden Gems** | <20 stars, recently updated, has description |
| **Trending** | Top 20 by 7-day star delta |
| **Forgotten Classics** | 100+ stars, no update in 12+ months |

### Library cards

Each card follows a **catalog-card** layout (top to bottom):

- **Call-number row** — repository `owner/name` in small monospace
- **Title** — the library name, bold uppercase (22 px on desktop, the
  visual anchor of the card)
- **By-statement** — `/ by <author>` in italic, ISBD style
- **Description** — up to 3 lines
- **Subject chips** — category + top architectures, uppercase, dot-separated
- **Meta row** — version, ★ stars, last-updated; license right-aligned

Pick-attribution (editor / themed / new / updated) lives in a small corner
badge with a matching dot next to the call number — the old left-edge color
stripe is gone.

Card dimensions: **380 × 280 px** on desktop, scaling down through 340 × 260
(≤1200 px), 280 × 240 (≤768 px), and 220 × 220 (≤480 px).

Click for the full detail modal — version history, dependencies, supported
architectures, and **Related Libraries** (scored by category, architecture
overlap, language, topics, and star proximity).

---

## For AI agents: MCP server

The catalog is also available as an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server, so any MCP-compatible agent — ZCode, Claude Desktop, Cursor, and others — can search Arduino libraries programmatically and get back ranked results with install snippets.

The server exposes a single `search_libraries` tool: pass a natural-language query (`"oled display"`, `"stepper motor"`, `"esp32 wifi"`) and optional filters (category, architecture, minimum GitHub stars), and it returns a concise ranked list — each entry includes the version, category, architectures, stars, dependencies, and a ready-to-paste `arduino-cli lib install "Name"` command. It fetches the enriched index from the live site with a one-hour cache, so it runs on any machine without a local checkout.

**Full setup instructions and configuration snippets for ZCode, Claude Desktop, and Cursor are in the [`mcp-server/`](mcp-server/) directory:**

👉 **[github.com/npuckett/arduino-libBrowser/tree/main/mcp-server](https://github.com/npuckett/arduino-libBrowser/tree/main/mcp-server)**

---

## How it stays current

Every hour the pipeline fetches Arduino's
[library_index.json.gz](https://downloads.arduino.cc/libraries/library_index.json.gz)
with an `ETag` — most of the time it's a 304 No-Content and the workflow
exits in under a second. When new releases land, the pipeline diffs them
against the existing database by SHA, enriches only the changed libraries
with GitHub metadata, and writes the result back. Every successful pipeline
run redeploys GitHub Pages.

API cost on a quiet day: **1 HTTP call**. On a busy day: **~50–200 GitHub
calls** (every repo that actually changed). The system is designed to stay
well under GitHub's 5,000/hour rate limit on a free PAT.

---

## Documentation

The technical reference for the system lives in [`docs/`](docs/):

| Document | What's in it |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Technical reference: data sources, change-detection algorithm, schema versioning, state management, performance, design choices |
| [Pipeline operations](docs/PIPELINE.md) | Runbook: local development, cron tiers, common tasks (force re-enrich, recover from bad sync, inspect changes), debugging |
| [Testing](docs/TESTING.md) | Test suite: 125 unit tests + 25 E2E + visual snapshots; how to run, how to add tests, when to regenerate baselines |
| [Curated Picks](docs/CURATED-PICKS.md) | The three pick streams: editor picks (`editors.json`), themed auto-picks (`themes.json`), and computed picks. Schemas, examples, and rules |
| [Contributing](docs/CONTRIBUTING.md) | Recipes: adding a sort mode, theme, editor, computed pick, library field, or GitHub Action |

---

## Contributing

The easiest contributions:

- **Add yourself as an editor** in `editors.json` and pick a library you love.
- **Propose a new theme** in `themes.json`.
- **Open an issue** for bugs, feature requests, or feedback.

For code contributions see [CONTRIBUTING.md](docs/CONTRIBUTING.md).

---

## License

This project is open source. Individual Arduino libraries maintain their own
licenses — check each library's repository for specific terms.