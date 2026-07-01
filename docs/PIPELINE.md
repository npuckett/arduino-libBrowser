# Pipeline Operations

The "how do I actually do X with this pipeline" document. If something here disagrees with reality, fix this file, not reality.

For architecture and design rationale, see [ARCHITECTURE.md](ARCHITECTURE.md). For tests, see [TESTING.md](TESTING.md). For high-level project context, see [../README.md](../README.md).

## Quick reference

All commands run from the repo root. They invoke `scripts/pipeline.ts` via `tsx`.

| Command | What it does |
|---------|--------------|
| `pnpm pipeline:dry` | Dry-run sync against the real Arduino index (no writes, no GitHub API calls) |
| `pnpm pipeline:hourly` | `sync` — fetch upstream index, diff against `state/sync-state.json`, write `output/libraries.json` + `output/changes.json` |
| `pnpm pipeline:daily` | `enrich` — refresh GitHub stars/forks/language for libraries missing or stale |
| `pnpm pipeline:weekly` | `stats` — compute trending, hidden gems, picks; write `output/stats.json` + `output/picks.json` |
| `pnpm pipeline:all` | `sync` → `enrich` → `stats` in sequence |

Flags (pass after the command, e.g. `pnpm pipeline:dry -- --verbose`):

| Flag | Applies to | Effect |
|------|-----------|--------|
| `--dry-run` | all | Compute everything but write no files. Skips GitHub API calls. |
| `--verbose` / `-v` | all | Pino log level → `debug` |
| `--full` | `sync` | Re-enrich every upstream library, not just new ones |

### Exit codes

| Code | Meaning | Retry? |
|------|---------|--------|
| 0 | Success (including no-op runs) | n/a |
| 1 | Transient error (network, GitHub rate limit, upstream fetch failure) | yes |
| 2 | Config error (bad CLI args, missing `output/libraries.json`, schema mismatch) | no |
| 130 | SIGINT / SIGTERM (Ctrl-C, runner cancel) | n/a |

Defined at `scripts/pipeline.ts:53-55`; signals handled at `scripts/pipeline.ts:146-160`.

---

## Local development

### Prerequisites

- Node 20+ (see `engines.node` in [../package.json](../package.json))
- pnpm 9+
- `jq` (handy for inspecting output JSON; not required)

### First-time setup

```bash
pnpm install
pnpm exec playwright install chromium   # only needed for `pnpm test:e2e`
```

That's it. No databases, no env files required for the pipeline itself. `GITHUB_TOKEN` is optional locally — without it, enrichment runs hit GitHub's 60 req/hr unauthenticated limit.

### Running locally

Start the static dev server (cross-platform `scripts/serve.mjs`; the original `Start-Server.ps1` also works on Windows):

```bash
node scripts/serve.mjs 8080          # http://localhost:8080
```

Run the pipeline against the real upstream index:

```bash
pnpm pipeline:dry                    # safe — no writes, no GitHub API
pnpm pipeline:hourly                 # writes output/ + state/
```

Run tests:

```bash
pnpm test                            # vitest, unit tests only (~1s)
pnpm test:watch                      # vitest watch mode
pnpm test:e2e                        # playwright, needs `pnpm exec playwright install chromium`
pnpm test:e2e:update                 # regenerate snapshots
pnpm lint                            # eslint pipeline/ tests/
pnpm typecheck                       # tsc --noEmit
```

Pre-push checklist:

```bash
pnpm pipeline:dry && pnpm test && pnpm lint && pnpm typecheck
```

---

## Production runs

### Workflow schedule

| Cron (UTC) | Workflow file | What it does |
|------------|---------------|--------------|
| `0 * * * *` (hourly) | `.github/workflows/hourly-sync.yml` | Fetch upstream `library_index.json.gz`, diff, enrich new libs, commit `output/` + `state/` |
| `0 6 * * *` (daily 06:00) | `.github/workflows/daily-enrich.yml` | Refresh GitHub stars/forks for libs missing or stale (`output/libraries.json` + `state/sync-state.json`) |
| `0 4 * * 0` (Sundays 04:00) | `.github/workflows/weekly-stats.yml` | Compute trending + picks (`output/stats.json` + `output/picks.json`) |
| on upstream workflow success / push to `main` | `.github/workflows/pages.yml` | Deploy repo root to GitHub Pages |

Each data workflow uses `concurrency.cancel-in-progress: true` so a slow run is replaced by the next trigger instead of stacking. Pages deploys do **not** cancel in progress.

### Manual triggers

Every data workflow exposes `workflow_dispatch` (Actions tab → select workflow → **Run workflow**). Inputs: **none**. All three use the default branch and `secrets.GITHUB_TOKEN`.

### What the workflows actually do

Each runs the same pattern (`.github/workflows/hourly-sync.yml:43-77` is canonical):

1. Checkout repo with write token
2. `pnpm install --frozen-lockfile`
3. Run the pipeline with `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
4. If `git status --porcelain` is non-empty, commit and push (`git pull --rebase` first)

The commit messages embed the timestamp and changed-file count, e.g.:

```
Hourly sync: update upstream library_index (2026-06-30 22:00 UTC) [3 files]
Daily enrich: GitHub metadata refresh (2026-06-30 06:00 UTC) [1 files]
Weekly stats: rollup refresh (2026-06-29 04:00 UTC) [2 files]
```

---

## Common tasks

### Force re-enrichment of every library

You want to ignore ETags and re-fetch GitHub metadata for all libraries. Two options:

**Option A — one-shot via CLI flag** (recommended):

```bash
pnpm pipeline:hourly -- --full
```

The `--full` flag forces the sync command to enrich every upstream release instead of only new ones (`scripts/pipeline.ts:292`). This still requires GitHub API calls and rate-limit budget.

**Option B — drop the ETag cache in state**:

```bash
jq 'del(.repoEtags)' state/sync-state.json > state/sync-state.json.tmp
mv state/sync-state.json.tmp state/sync-state.json
git add state/sync-state.json && git commit -m "chore: drop repoEtags to force re-enrich"
```

The next `pnpm pipeline:daily` (or `pnpm pipeline:hourly`) will treat every library as having no cached ETag and re-query GitHub.

### Recover from a bad sync

If the last sync wrote bad data (bad diff, corrupt state, partial write), revert and re-run:

```bash
# 1. See what's changed in the last commit
git log --oneline -5 -- output/ state/

# 2. Revert the most recent pipeline commit (find the SHA from the workflow log)
git revert --no-edit <bad-commit-sha>
git push

# 3. If state/sync-state.json is poisoned, revert just it and force a fresh sync
git checkout origin/main -- state/sync-state.json
pnpm pipeline:hourly
```

Files to inspect when diagnosing a bad sync:

| File | What's in it |
|------|--------------|
| `output/libraries.json` | The merged library catalog (last successful write) |
| `output/changes.json` | What `sync` last considered "new/updated/removed" |
| `state/sync-state.json` | ETags, SHAs, firstSeenAt, previousVersion, versionHistory |
| `output/stats.json` | Last computed stats rollup |
| `output/picks.json` | Last computed editorial + theme picks |

Output files are written atomically via `tmp + rename` (`scripts/pipeline.ts:168-174`), so a crash mid-write leaves the previous file intact.

### Inspect what changed in the last sync

```bash
jq '. | {since, new: (.new_libraries | length), updated: (.updated_libraries | length), removed: (.removed_libraries | length)}' output/changes.json
```

Schema of `output/changes.json`:

```jsonc
{
  "since": "2026-06-30T22:37:15.403Z",         // lastHighWaterMark at the time of the diff
  "new_libraries": [ /* full Library objects */ ],
  "updated_libraries": [
    { "library": { /* Library */ }, "old_version": "1.2.3", "new_version": "1.2.4" }
  ],
  "removed_libraries": [ "owner/repo", ... ]
}
```

To see actual diffs against the previous file:

```bash
git diff HEAD~1 -- output/libraries.json | head
git log -p --follow output/changes.json | less
```

### Verify the pipeline before pushing

```bash
pnpm pipeline:dry
```

This runs `sync --dry-run`: fetches the upstream index, computes the diff, but skips GitHub API calls and writes no files. Useful for:

- Validating that the upstream index is parseable
- Confirming CLI wiring after a refactor
- Sanity-checking after editing `pipeline/src/types.ts` or transforms

Expected output (approximate):

```
[22:00:00.123] INFO pipeline starting {"command":"sync","dryRun":true,"full":false}
[22:00:01.456] INFO sync: upstream index updated {"releases":9611,"etag":"W/\"b2836ad62606a28e0ca632a2bb0ddc2c\""}
[22:00:01.457] INFO sync: changes detected {"new":327,"updated":3879,"removed":239}
[22:00:01.458] INFO sync: dry-run; skipped GitHub calls {"skipped":4206}
[22:00:01.459] INFO sync: dry-run, not writing files {"wouldWrite":9611,"new":327,"updated":3879,"removed":239}
[22:00:01.460] INFO pipeline complete {"command":"sync"}
```

Exit code 0 with `wouldWrite` > 0 means the pipeline is ready to write — re-run without `--dry-run` to actually commit changes.

### Add a new data field

Suppose you want every `Library` to carry a new field, e.g. `license_spdx_id`.

1. **Add to the type**: edit `pipeline/src/types.ts` — extend the `Library` interface. Make the field optional (`?`) if it might be missing in V1.5 imports.

2. **Populate during migration** (if importing from V1.5 or older schemas): edit `pipeline/src/transforms/v1-to-v2-migration.ts` — add a setter inside `migrateLibrary()`.

3. **Populate during sync** (if the field comes from the upstream Arduino index): edit `pipeline/src/transforms/diff-detector.ts` and/or the place in `scripts/pipeline.ts:runSync` where `Library` objects are constructed.

4. **Populate during enrich** (if it comes from GitHub): edit `pipeline/src/sources/github-meta.ts` and the `applyEnrichment()` block in `scripts/pipeline.ts:201-213`.

5. **Surface it in output** (if it should appear in `libraries.json`): edit `pipeline/src/output/build-libraries-json.ts`.

6. **Add fixtures + tests**: drop a V1.5 fixture into `pipeline/tests/fixtures/` and add a migration unit test under `pipeline/tests/unit/`.

7. **Verify**: `pnpm pipeline:dry && pnpm test && pnpm lint && pnpm typecheck`.

If the new field changes the on-disk schema in a breaking way, add a migration (see [Adding a new schema version](#adding-a-new-schema-version)).

### Investigate "where did this library come from?"

Use `state/sync-state.json`. Every library is keyed by its `repository_name` (`owner/repo`).

```bash
# When was it first seen?
jq '.firstSeenAt["sandeepmistry/LoRa"]' state/sync-state.json
# → "2025-07-21T16:04:53Z"

# What's its recorded version history?
jq '.versionHistory["sandeepmistry/LoRa"]' state/sync-state.json

# What's the last seen upstream sha?
jq '.lastSeenSha["sandeepmistry/LoRa"]' state/sync-state.json

# What version did we previously have on file?
jq '.previousVersion["sandeepmistry/LoRa"]' state/sync-state.json
```

If the library isn't in `firstSeenAt`, it appeared in the very last sync — search the most recent commit:

```bash
git log -p -S 'owner/repo' -- output/libraries.json | less
```

---

## Debugging

### Verbose logging

Add `--verbose` (or `-v`) for pino `debug` level:

```bash
pnpm pipeline:hourly -- --verbose
pnpm pipeline:daily -- -v
pnpm pipeline:all -- --verbose --dry-run
```

Output is pretty-printed via `pino-pretty` when stdout is a TTY; CI logs are newline-delimited JSON instead.

### State file corruption

`state/sync-state.json` is rebuilt on every successful sync and is read by every command. If it's malformed:

```bash
# Inspect top-level keys + counts
jq 'keys, .knownLibraryCount, (.repoEtags | length), (.firstSeenAt | length)' state/sync-state.json

# Validate JSON
jq -e . state/sync-state.json > /dev/null && echo OK || echo BROKEN
```

To start fresh (loses ETag caching; the next run will re-enrich every library):

```bash
rm state/sync-state.json
pnpm pipeline:hourly         # rebuilds state/
```

Safer alternative — keep the file but clear only the per-repo ETag cache:

```bash
jq '.repoEtags = {}' state/sync-state.json > state/sync-state.json.tmp \
  && mv state/sync-state.json.tmp state/sync-state.json
pnpm pipeline:daily
```

If the schema itself is suspect, compare against a known-good fixture:

```bash
diff <(jq 'keys' state/sync-state.json | sort) \
     <(jq 'keys' pipeline/tests/fixtures/sync-state.example.json | sort)
```

### Rate limit errors

The GitHub API key is the env var `GITHUB_TOKEN` (`scripts/pipeline.ts:309, 463`).

**Locally:**

```bash
export GITHUB_TOKEN=ghp_xxx          # needs `public_repo` scope for read-only repo metadata
pnpm pipeline:daily
```

**In CI:** the workflows pass `secrets.GITHUB_TOKEN` automatically (`.github/workflows/hourly-sync.yml:45`, `daily-enrich.yml:45`, `weekly-stats.yml:45`). Limits:

| Auth | Limit |
|------|-------|
| Unauthenticated | 60 req/hr per IP |
| `secrets.GITHUB_TOKEN` (Actions) | 1000 req/hr per repo |

When a limit is hit, `scripts/pipeline.ts` logs the failed repo and continues; see the warning format at `scripts/pipeline.ts:245-249`. The run still exits 0 unless the failure is fatal. If you see many `rateLimitHits` in CI, wait an hour or back off the daily cron.

### Upstream schema changed

The Arduino Library Index occasionally adds/renames fields. The shape is captured at `pipeline/src/types.ts:29-47` (`ArduinoIndexEntry`).

1. **Inspect the upstream payload directly:**

   ```bash
   curl -sSL https://downloads.arduino.cc/libraries/library_index.json.gz \
     | gunzip | jq '.[] | keys' | head -50
   ```

2. **Locate the parser**: `pipeline/src/sources/arduino-index.ts` — extend the `ArduinoIndexEntry` mapping for any new field.

3. **Add to `Library` only if the field is worth carrying** (see [Add a new data field](#add-a-new-data-field)).

4. **Bump the schema** if it changes the on-disk shape of `output/libraries.json`:

   ```bash
   jq '.version = 3' output/libraries.json > /dev/null   # increment the top-level version
   ```

   …and add a migration (see [Adding a new schema version](#adding-a-new-schema-version)).

---

## Migration

The pipeline auto-migrates `output/libraries.json` from older schemas on every read. You almost never need to run a migration by hand.

### V1.5 → V2

The V1.5 schema (the old production format) used **string** `architectures` and `depends` fields, and lacked V2-only fields like `first_seen_at`, `last_seen_sha`, `version_history`, and `release_count`.

Migration happens in two places, both invoked automatically:

1. **`migrateLibraries()`** in `pipeline/src/transforms/v1-to-v2-migration.ts:246-260` runs every time `output/libraries.json` is read (`scripts/pipeline.ts:185`). It walks the `libraries` array and converts any V1.5-shaped record into V2 via `migrateLibrary()` (same file, line 189).

2. **`seedStateFromLibraries()`** in `pipeline/src/transforms/v1-to-v2-migration.ts:292-321` runs at the top of every `sync` (`scripts/pipeline.ts:280`). It backfills `state/sync-state.json` from the existing libraries so the diff-detector doesn't mark all 9000+ libraries as new on the first V2 run.

What this means in practice:

- You can drop a V1.5 `output/libraries.json` into a fresh clone and immediately run `pnpm pipeline:hourly` — the migration handles the rest.
- The first post-migration sync will write many "updated" entries (because `last_seen_sha` is recomputed); the comment at `scripts/pipeline.ts:333-339` explains the V1.5 enrichment fallback that preserves `github_stars` etc. through the transition.

### Adding a new schema version

When `output/libraries.json` (or `state/sync-state.json`) needs a breaking change:

1. **Extend the type**: add new fields to `Library` / `SyncState` in `pipeline/src/types.ts`. Make them optional if old data must still load.

2. **Add a migration function** in `pipeline/src/transforms/` (or a new file). Follow the pattern in `v1-to-v2-migration.ts`:
   - An `isV2Library(raw)` predicate that detects the old shape
   - A `migrateLibrary(raw, now)` that returns the new shape
   - An array-level `migrateLibraries(raws, now)` that mixes old + new

3. **Wire it into the readers**: call your new `migrateLibraries()` everywhere the file is read. The canonical site is `readPreviousLibraries()` at `scripts/pipeline.ts:181-190`.

4. **Seed state if needed**: if your new fields live in `SyncState`, extend `seedStateFromLibraries()` to backfill from existing libraries, so the first run after the schema bump doesn't trigger mass re-processing.

5. **Bump the on-disk version**: if `libraries.json` carries a top-level `version`, increment it (`buildLibrariesJson` in `pipeline/src/output/build-libraries-json.ts`).

6. **Add unit tests**: copy the V1.5 fixture pattern at `pipeline/tests/unit/v1-to-v2-migration.test.ts` and `pipeline/tests/fixtures/sample-libraries.ts`.

7. **Document the breaking change** at the top of `CHANGELOG.md` and link it from here.

---

## Exit code reference

| Code | Constant | Meaning | Workflow behavior |
|------|----------|---------|-------------------|
| 0 | `EXIT_OK` (`scripts/pipeline.ts:53`) | Success, including no-op runs | Job succeeds; commit step runs |
| 1 | `EXIT_RETRYABLE` (`scripts/pipeline.ts:54`) | Transient error: upstream fetch failure, GitHub rate limit, unexpected exception | Job fails; GitHub Actions schedules a retry per the workflow's retry semantics |
| 2 | `EXIT_CONFIG` (`scripts/pipeline.ts:55`) | Config error: bad CLI args, missing `output/libraries.json`, bad schema | Job fails; do **not** retry — fix config first |
| 130 | hard-coded (`scripts/pipeline.ts:152`) | SIGINT / SIGTERM | Job cancels |

How errors are classified: see the `instanceof ConfigError` / `instanceof RetryableError` checks at `scripts/pipeline.ts:596-606`. Throwing `new ConfigError(...)` from any pipeline code gives you exit code 2 automatically.

---

## File layout

```
arduino-libBrowser/
├── scripts/
│   ├── pipeline.ts            # CLI entrypoint (sync / enrich / stats / all)
│   └── serve.mjs              # Static dev server (cross-platform alternative to Start-Server.ps1)
│
├── pipeline/
│   ├── src/
│   │   ├── types.ts           # Library, SyncState, ChangesOutput, ArduinoIndexEntry, …
│   │   ├── sources/
│   │   │   ├── arduino-index.ts   # Fetch + parse upstream library_index.json.gz
│   │   │   └── github-meta.ts     # ETag-aware GitHub repo metadata fetcher
│   │   ├── transforms/
│   │   │   ├── diff-detector.ts        # new/updated/removed detection
│   │   │   ├── v1-to-v2-migration.ts   # Schema migration (runs on every read)
│   │   │   ├── daily-seed.ts           # Deterministic per-day seed for picks
│   │   │   ├── fuzzy-search.ts         # Library search scoring
│   │   │   ├── theme-picker.ts         # Theme-based library selection
│   │   │   ├── library-properties.ts   # Parse library.properties text
│   │   │   └── computed-picks.ts       # Hidden gems, trending, forgotten classics
│   │   ├── output/
│   │   │   ├── build-libraries-json.ts # output/libraries.json serializer
│   │   │   ├── build-changes-json.ts   # output/changes.json serializer
│   │   │   ├── build-stats-json.ts     # output/stats.json serializer
│   │   │   └── build-picks-json.ts     # output/picks.json serializer
│   │   └── utils/
│   │       ├── state.ts          # load/save/empty SyncState
│   │       ├── hash.ts           # sha256Short for synthetic content hashes
│   │       ├── http.ts           # fetch + ETag/Last-Modified plumbing
│   │       └── sleep.ts          # delayMs helper for rate limiting
│   └── tests/
│       ├── unit/                 # vitest unit tests
│       └── fixtures/             # sample libraries, sample state, sample editor/theme files
│
├── state/
│   └── sync-state.json           # Persisted state (ETags, SHAs, history) — committed to git
│
├── output/                       # Pipeline outputs — committed to git
│   ├── libraries.json            # Merged catalog (versioned schema)
│   ├── changes.json              # Last sync's new/updated/removed
│   ├── stats.json                # Trending, hidden gems, etc.
│   └── picks.json                # Editor + theme picks
│
├── editors.json                  # Input: editorial picks
├── themes.json                   # Input: theme definitions
│
└── .github/workflows/
    ├── hourly-sync.yml           # 0 * * * * — sync + enrich new
    ├── daily-enrich.yml          # 0 6 * * * — refresh GitHub metadata
    ├── weekly-stats.yml          # 0 4 * * 0 — stats + picks
    └── pages.yml                 # Deploy to GitHub Pages on workflow_run success
```

---

**Still stuck?** Check the workflow run logs (Actions tab → select run → expand the `Run hourly pipeline` step) — pino logs include the command, command, and per-stage metrics that pin down where it failed.