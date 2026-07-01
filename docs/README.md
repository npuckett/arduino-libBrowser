# Documentation

The technical reference for this project lives in this folder. The README at
the repo root is the user-facing entry point; everything below is for people
working on the system itself.

## Documents

| File | When to read it |
|------|----------------|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Want to understand how the system fits together: data flow, change-detection algorithm, schema versioning, design choices |
| [`PIPELINE.md`](PIPELINE.md) | Want to run or debug the pipeline: commands, cron tiers, common tasks, exit codes |
| [`TESTING.md`](TESTING.md) | Want to run tests, add tests, or understand the test harness |
| [`CURATED-PICKS.md`](CURATED-PICKS.md) | Want to understand how Editor Picks, themed rows, and computed picks are produced |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Want to add a feature: a sort mode, a theme, an editor, a new library field, etc. |

## Reading order

- **New to the project?** Read `ARCHITECTURE.md` top-to-bottom. It gives you
  the mental model.
- **Need to run the pipeline?** Read `PIPELINE.md`. It has commands.
- **Adding a feature?** Start with `CONTRIBUTING.md`, then follow the link
  into the relevant doc (e.g. `CURATED-PICKS.md` if you're adding a theme).
- **Debugging a test failure?** Read `TESTING.md` for how the harness works.

## Where things live

```
docs/
  README.md          ← you are here
  ARCHITECTURE.md    technical reference
  PIPELINE.md        operations runbook
  TESTING.md         testing guide
  CURATED-PICKS.md   curated picks deep dive
  CONTRIBUTING.md    extension recipes
```

```
repo root:
  README.md          user-facing entry (this is what visitors see on GitHub)
  CHANGELOG.md       what changed in each release
  ARCHITECTURE quick links live in README.md and CHANGELOG.md
```