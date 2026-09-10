<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Apply JSDoc across src/ to satisfy jsdoc/require-{param,returns,throws}

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium-Large

## Summary

After lifting jsdoc/* rules to error in eslint.config.mjs, baseline scan under the **real config** (no `--rule` overrides) reports **1383 violations across ~200 hand-edited files** in src/.

Rule distribution (approximate, from --rule probes):
- `jsdoc/require-returns`: dominant (majority of 1383) — functions returning non-void
- `jsdoc/require-param`: smaller subset — functions with non-obvious parameters
- `jsdoc/require-throws`: ~49 violations (priority — JS has no throw-signal via types)

**Already exempted in eslint.config.mjs** (do NOT add JSDoc here):
- `src/db/schema*.ts` (20 generated files from `bun run db:sync-types`)
- `src/db/schema.ts`, `src/db/schema-manifest.ts` (explicit)
- `src/validation/db-schemas.ts` (generated)
- `src/test-utils/insert-helpers.ts` (generated)
- `src/**/*.test.ts` + `src/**/*.integration.test.ts` (test files)

**Known hand-edited files in src/db/ that also need JSDoc** (NOT exempted, surface with errors):
- `src/db/state.ts` (8 errors)
- `src/db/content-version.ts` (4 errors)
- `src/db/index.ts` (3 errors)
- `src/db/migrate.ts` (1 error)
- (16 total — small enough to fix in any single batch)

## Per-directory distribution (real-config scan)

| Errors | Directory |
|---|---|
| 312 | frontend |
| 232 | generation |
| 165 | characters |
| 105 | chat |
| 100 | crypto |
| 90 | assets |
| 76 | assistant |
| 60 | config |
| 55 | image-edit |
| 54 | federation |
| 53 | battle |
| 18 | db |
| 15 | cron |
| 14 | content |
| 10 | async, i18n |
| 5 | auth |
| 4 | group-chat |
| 2 | aux-pipeline |
| 1 | build, hash, inference |
| 0 | admin, age-gate, app, components, eslint-rules, integrations |

## Approach

1. Add `@throws {Error} When <condition>` on functions whose body throws, returns `Result.err`, or rejects a Promise
2. Add `@returns` only when non-obvious from signature (omit when type suffices)
3. Add `@param` only when name clarifies
4. Keep blocks ≤3 lines (per AGENTS.md)

## Suggested partition (3 batches)

- **Batch A** (626 errors): `characters/`, `crypto/`, `battle/`, `auth/`, `aux-pipeline/`, `build/`, `db/`
- **Batch B** (382 errors): `chat/`, `assets/`, `config/`, `federation/`, `cron/`, `content/`, `async/`, `i18n/`, `group-chat/`
- **Batch C** (619 errors): `frontend/`, `generation/`, `image-edit/`, `assistant/`

Each batch = one worktree, one commit. Run `bun run check` between batches; rule lifts must remain green for unrelated gates.

## Acceptance Criteria

- [ ] All 1383 jsdoc violations resolved
- [ ] No new eslint warnings introduced
- [ ] `bun run check` green (or jsdoc-only residual is 0)
- [ ] Each modified file remains under 200 lines (AGENTS.md file size rule)

## Evidence

Stored in `tree/jsdoc-liftup/.tmp/`:
- `strict-real-config.txt`: per-subdir counts under real config (no overrides) — authoritative
- `all-rules-files.txt`: per-file breakdown (--rule scan, may be 2x off)
- `non-test-throws.txt`: per-subdir require-throws breakdown (42 errors from scan + 7 from manual re-check = 49 total)
- `group-A.txt`, `group-B.txt`: early partition lists (now superseded by 3-batch plan)

## Verification commands

```bash
# Per-batch gate
npx eslint src/<batch-dir>/ --format json | jq '[.[] | .messages[] | select(.ruleId | startswith("jsdoc/"))] | length'

# Final acceptance
bun run check
```
