# Contributing

This is the "how to add a feature" document. Each section is a self-contained recipe — pick the one that matches your change and follow it end-to-end. For background on *why* the system is shaped this way, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Adding a new sort mode (client-side)

Sort modes run in `index.html` inside `sortLibraries()`. This is the right place for sort logic that only needs data already present in `libraries.json` — no extra computation, no server roundtrip.

### When to use
- The sort doesn't need data beyond what `libraries.json` already contains.
- Examples: name length sort, alphabetize by author, "shortest sentence first", etc.

### Recipe
1. Add a `<button class="sort-btn" data-sort="<your-id>">` to the `.sort-buttons` div in `index.html`.
2. Add a `case '<your-id>':` block in `sortLibraries()` and return the sorted array.
3. Add a brief one-line comment above the case explaining the sort.
4. If the logic is non-trivial (e.g., it uses a non-obvious tiebreaker), add a unit test for the comparator function.

### Example: "Shortest Name" sort

In `index.html`, add the button inside `.sort-buttons`:

```html
<button class="sort-btn" data-sort="shortest-name">Shortest Name</button>
```

Then add the case inside `sortLibraries()`:

```js
case 'shortest-name':
    // Sort by character length of the library name, then alphabetical as tiebreaker
    return sorted.sort((a, b) => {
        const lenDiff = (a.name || '').length - (b.name || '').length;
        if (lenDiff !== 0) return lenDiff;
        return safeNameCompare(a, b);
    });
```

That's it — the button automatically wires up via `setupSortButtons()` (index.html:745) and `applyFilters()` will route through your case.

---

## Adding a new sort mode (server-side)

Some sorts need data computed by the weekly pipeline — e.g., trending scores or weekly delta stats that aren't in `libraries.json`. These have to land in a JSON file the frontend can fetch.

### When to use
- The sort requires data computed by the weekly pipeline.
- Examples: weekly delta stars, hidden gems (already exists), trending scores (already exists).

### Recipe
1. Implement the computation in `pipeline/src/transforms/computed-picks.ts` (or a new file in `pipeline/src/transforms/`).
2. Wire it into `build-picks-json.ts` so it ends up in `picks.json` or `stats.json`.
3. Load that file in `index.html`'s `loadSupportingData()`.
4. Add the sort button.
5. Add the case to `sortLibraries()` that uses the loaded data.

### Example: "Most Loved" sort (star ratio)

A "Most Loved" sort ranks libraries by `stars / forks` — high stars, low forks = beloved code. This requires no new server data, but illustrates the pattern of "frontend loads extra JSON, then sorts with it."

**Step 1 — Make the data available.** Stars and forks are already in `libraries.json`, so no pipeline change is needed. Skip to step 3.

If your sort *did* need new computed data, you'd add a function to `computed-picks.ts`:

```ts
export function mostLoved(
  libraries: Library[],
  options: ComputedPicksOptions = {}
): Library[] {
  const limit = clampLimit(options.mostLovedLimit, 20);
  return libraries
    .filter(lib => getStars(lib) >= 10) // ignore noise
    .map(lib => ({
      lib,
      ratio: getStars(lib) / Math.max(getForks(lib), 1),
    }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, limit)
    .map(entry => entry.lib);
}
```

Then add the field to `PicksComputed` in `pipeline/src/types.ts`:

```ts
export interface PicksComputed {
  // ...existing fields...
  most_loved: Library[];
}
```

Then wire it in `buildComputed()` inside `pipeline/src/output/build-picks-json.ts`:

```ts
return {
  // ...existing fields...
  most_loved: mostLoved(libraries, {
    now,
    mostLovedLimit: options.mostLovedLimit,
  }),
};
```

**Step 2 — Load it in the frontend.** In `loadSupportingData()` in `index.html`:

```js
const picks = await fetch(`output/picks.json?v=${Date.now()}`).then(r => r.ok ? r.json() : null);
if (picks?.computed?.most_loved) {
    // store a lookup map for fast access
    for (let i = 0; i < picks.computed.most_loved.length; i++) {
        lovedScores[picks.computed.most_loved[i].repository_name] = picks.computed.most_loved.length - i;
    }
}
```

**Step 3 — Add the button:**

```html
<button class="sort-btn" data-sort="most-loved">Most Loved</button>
```

**Step 4 — Add the case to `sortLibraries()`:**

```js
case 'most-loved': {
    return [...libraries].sort((a, b) => {
        const scoreA = lovedScores[a.repository_name] || 0;
        const scoreB = lovedScores[b.repository_name] || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return safeNameCompare(a, b);
    });
}
```

---

## Adding a new theme

Themes are static, PR-editable configurations — no code changes required.

### Recipe
1. Edit `themes.json` at the project root.
2. Append a new theme entry to the `themes` array.
3. Push to a branch and open a PR.

The weekly pipeline will pick it up on the next run, and `buildPicksJson()` will compute matches automatically.

### Criteria fields

`ThemeCriteria` (defined in `pipeline/src/types.ts:101`) supports:

- **`categories_any`**: `library.category` must appear in this list (case-insensitive match).
- **`architectures_any`**: at least one of `library.architectures` must appear in this list.
- **`min_stars`**: `library.github_stars` must be ≥ this value. Libraries without `github_stars` are excluded.
- **`exclude_categories`**: `library.category` must NOT appear in this list.

All criteria are AND'd together. An empty/missing field means "no constraint."

### Example

```json
{
  "id": "robotics",
  "title": "Robotics",
  "criteria": {
    "categories_any": ["Robotics", "Motor Control", "Device Control"],
    "architectures_any": ["avr", "esp32", "samd"],
    "min_stars": 20,
    "exclude_categories": ["Uncategorized"]
  },
  "count": 8
}
```

- `id` is the slug used in `picks.json` keys — keep it stable.
- `count` caps the number of libraries shown in the themed row.
- After merging, run `pnpm pipeline:weekly` locally to verify the theme populates.

---

## Adding a new editor

Editors are static, PR-editable configurations. An "editor" is a person or org whose curated picks appear in the Curated Discoveries section.

### Recipe
1. Edit `editors.json` at the project root.
2. Append a new editor entry to the `editors` array.
3. Each editor needs at least one pick (the frontend hides editors with zero picks).
4. Push to a branch and open a PR.

### Pick schema

Each entry in `picks` matches `EditorPick` in `pipeline/src/types.ts:87`:

- **`library`**: the library `name` (case-insensitive match — must match a library already in `libraries.json`).
- **`picked_at`**: ISO date string (`YYYY-MM-DD`).
- **`note`** (optional): a short sentence shown on the card.

### Example

```json
{
  "id": "sparkfun",
  "name": "SparkFun Electronics",
  "url": "https://github.com/sparkfun",
  "bio": "Open-source hardware company specializing in breakout boards and sensors for makers.",
  "picks": [
    {
      "library": "SparkFun_BME280",
      "picked_at": "2026-06-15",
      "note": "Rock-solid temperature/humidity/pressure sensor driver."
    },
    {
      "library": "SparkFun_u-blox_GNSS",
      "picked_at": "2026-06-20",
      "note": "The easiest way to get GPS working on Arduino."
    }
  ]
}
```

To verify locally, run `pnpm pipeline:weekly` and check that `output/picks.json` contains your editor with all `library` values resolved to real records.

---

## Adding a new computed pick section

Computed picks live in `pipeline/src/output/build-picks-json.ts`. They appear on the home page above the themed rows in the "This Week" section.

### Recipe
1. Implement the algorithm in `pipeline/src/transforms/computed-picks.ts` (or a new file in `pipeline/src/transforms/`).
2. Add the field to `PicksComputed` in `pipeline/src/types.ts`.
3. Wire it into `buildComputed()` in `pipeline/src/output/build-picks-json.ts`.
4. Add a row to the frontend in `displayCuratedDiscoveries()` in `index.html`.

### Example: "User Favorites" computed pick

A fictional "User Favorites" section that ranks libraries by some heuristic.

**Step 1 — Algorithm in `pipeline/src/transforms/computed-picks.ts`:**

```ts
export function userFavorites(
  libraries: Library[],
  options: ComputedPicksOptions = {}
): Library[] {
  const limit = clampLimit(options.userFavoritesLimit, 8);
  return libraries
    .filter(lib => getStars(lib) >= 50)
    .filter(hasDescription)
    .sort((a, b) => {
      const starsDiff = getStars(b) - getStars(a);
      if (starsDiff !== 0) return starsDiff;
      return getUpdatedMs(b) - getUpdatedMs(a);
    })
    .slice(0, limit);
}
```

**Step 2 — Add to `PicksComputed` in `pipeline/src/types.ts`:**

```ts
export interface PicksComputed {
  new_this_week: Library[];
  updated_this_week: UpdatedLibraryChange[];
  hidden_gems: Library[];
  trending: Library[];
  forgotten_classics: Library[];
  user_favorites: Library[];
}
```

**Step 3 — Wire into `buildComputed()` in `pipeline/src/output/build-picks-json.ts`:**

```ts
return {
  // ...existing fields...
  user_favorites: userFavorites(libraries, {
    now,
    userFavoritesLimit: options.userFavoritesLimit,
  }),
};
```

Also add the option to `BuildPicksJsonOptions` in the same file:

```ts
export interface BuildPicksJsonOptions {
  // ...existing fields...
  userFavoritesLimit?: number;
}
```

**Step 4 — Frontend row.** In `index.html`, find `displayCuratedDiscoveries()` and add a row:

```js
const userFavorites = picks.computed?.user_favorites || [];
if (userFavorites.length > 0) {
    const row = document.createElement('div');
    row.className = 'curated-row computed-row';
    row.innerHTML = `
        <div class="curated-section-header">User Favorites</div>
        <div class="curated-grid">
            ${userFavorites.map(lib => createCuratedCard(lib, 'user_favorites')).join('')}
        </div>
    `;
    document.getElementById('curatedDiscoveries').appendChild(row);
}
```

---

## Adding a new field to libraries.json

The library schema is versioned (currently v2). Adding fields is backwards-compatible as long as you follow the optional-first rule.

### Recipe
1. Add the field to `Library` in `pipeline/src/types.ts` as **optional** (use `?:`).
2. Populate it in `releaseToLibrary()` in `pipeline/src/transforms/diff-detector.ts`.
3. Optionally, migrate existing data via `v1-to-v2-migration.ts` if the field can be derived for old records.
4. Use it in the frontend (it's already accessible on `lib.<field>` in `index.html`).

### Backwards compatibility

- **Optional fields** don't break the schema. Old data without the field will be `undefined`; consumers must handle that.
- **Required fields** require a migration:
  - Add a default value derivation in `v1-to-v2-migration.ts`.
  - Bump the schema version comment.
  - Run the migration on existing `libraries.json` before deploying the schema change.

### Example: adding `github_created_at`

```ts
// pipeline/src/types.ts
export interface Library {
  // ...existing fields...
  github_created_at?: string; // ISO 8601 timestamp
}
```

```ts
// pipeline/src/transforms/diff-detector.ts — inside releaseToLibrary()
const lib: Library = {
  // ...existing fields...
  github_created_at: release.github_created_at || undefined,
};
```

For older records, the field will be `undefined` and the frontend should guard with `(lib.github_created_at || '1900-01-01')`.

---

## Adding a new GitHub Actions workflow

We have 5 workflows: `hourly-sync.yml`, `daily-enrich.yml`, `weekly-stats.yml`, `test.yml`, `pages.yml`. Adding a 6th is OK if it's truly separate from these.

### When to add
- A new data source that doesn't fit the hourly/daily/weekly cadence.
- A periodic check (e.g., dependency vulnerability scan, link rot detection).
- A one-time data import from a new registry.

### When NOT to add
- If the work fits cleanly into one of the existing pipelines — extend it instead.
- If the workflow can be expressed as a step inside an existing job.

### Recipe
1. Create a new `.yml` file in `.github/workflows/`.
2. Use the standard skeleton below.
3. If it writes data back to the repo, follow the "Detect and commit changes" pattern from `daily-enrich.yml`.

### Minimal workflow template

```yaml
name: My New Check

on:
  schedule:
    - cron: '0 3 * * 1'  # weekly on Mondays at 03:00 UTC
  workflow_dispatch:

concurrency:
  group: my-new-check-${{ github.ref }}
  cancel-in-progress: true

permissions: {}

jobs:
  check:
    name: Run the check
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: write  # only if committing back

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          persist-credentials: true

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run the check
        run: pnpm my-new-script

      # Only include the commit step if your workflow writes data back:
      - name: Detect and commit changes
        if: always()
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action - My New Check"
          if [ -n "$(git status --porcelain)" ]; then
            git add -A
            git commit -m "My new check: $(date -u '+%Y-%m-%d %H:%M UTC')"
            git push
          fi
```

### Required conventions

- **`concurrency`** — always set, with `cancel-in-progress: true`, so re-runs don't pile up.
- **`permissions: {}`** at the top level, with per-job overrides — least privilege.
- **`timeout-minutes`** — always set; don't rely on the 6-hour default.
- **pinned versions** — pin Node (`'20'`), pnpm (`9`), and action versions (`@v4`).

---

## Code conventions

These are enforced by `eslint` (`pipeline/src/**/*.ts`) and `tsconfig.json` (`strict: true`).

- **TypeScript strict mode** — no implicit `any`, strict null checks, strict function types.
- **ESM modules** — use `import`/`export`, not `require`. File extensions in imports are `.js` (even for `.ts` source) due to Node's ESM resolution.
- **No `any`** — use `unknown` and narrow with type guards. If you must accept arbitrary input, parse and validate.
- **Explicit return types** — all exported functions declare their return type. Internal helpers don't need to.
- **File names** — `kebab-case.ts` (e.g., `theme-picker.ts`).
- **One concept per file** where possible. If a file grows past ~250 lines, it's probably two concepts.
- **Test files** — colocate as `<thing>.test.ts` next to the source (e.g., `pipeline/src/transforms/computed-picks.ts` ↔ `pipeline/tests/unit/computed-picks.test.ts`).
- **No barrel files** — import directly from the source file.
- **No comments unless they explain *why*** — code should be self-documenting; comments are for non-obvious decisions, not restating what the code does.

---

## Commit message conventions

This project uses a lightweight Conventional Commits style. Format:

```
<type>(<scope>): <short summary>

[optional body explaining the why]

[optional footer with references]
```

### Types

- **`feat`** — new user-facing feature (new sort mode, new theme type, etc.).
- **`fix`** — bug fix.
- **`docs`** — documentation only.
- **`refactor`** — code change that neither fixes a bug nor adds a feature.
- **`test`** — adding or fixing tests.
- **`chore`** — tooling, CI, dependency bumps.
- **`perf`** — performance improvement.

### Scopes

Common scopes: `pipeline`, `frontend`, `themes`, `editors`, `ci`, `tests`, `types`.

### Examples

```
feat(frontend): add "Shortest Name" sort mode
fix(pipeline): handle missing github_stars in most-loved ranking
docs: document how to add a new sort mode
refactor(pipeline): extract clampLimit into shared util
test(computed-picks): cover empty trending scores edge case
```

The automated daily/weekly pipelines use a different format (`Daily update: ...`, `Weekly stats: ...`) — that's intentional, those messages describe data refreshes, not code changes.

---

## PR conventions

- **One feature per PR** — keep changes reviewable. A new sort mode is one PR; a new sort mode + a new theme + a refactor is three PRs.
- **Reference any related issue** in the PR body (`Closes #123` or `Refs #123`).
- **Include tests for any behavior change** — unit tests for pipeline changes, Playwright tests for frontend changes.
- **Update the relevant doc** — if you're adding a sort mode, mention it in `index.html`'s button list and consider whether `README.md` needs an update.
- **Run `pnpm test && pnpm test:e2e` locally before pushing** — both must pass.
- **Run `pnpm lint && pnpm typecheck`** to catch style/type errors before review.
- **Avoid drive-by changes** — if you spot something unrelated that needs fixing, file an issue or open a separate PR.

---

## Getting help

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system context.
- Read [PIPELINE.md](./PIPELINE.md) for pipeline cadence and rationale.
- Open an issue on GitHub for design questions before starting a large change.