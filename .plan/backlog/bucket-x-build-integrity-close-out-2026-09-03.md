<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Bucket X Close-out — Build Integrity (2026-09-03)

> Captures the Bucket X work that landed on `dev` between
> commits `6c55ed8c` and `1cddba36` — 4 release-blocking `tsc`/tooling
> defects surfaced after the `bun run check` gate was skipped during the
> 154+ commit ahead window, plus the dprint-driven import-order follow-up
> that landed alongside the new route handler.

## Scope (committed to `dev`)

| Commit | Title | Cluster |
|---|---|---|
| `4a1f56b8` | fix(plan): resolve Bucket X build integrity (4 release-blocking tsc + tooling defects) | build-integrity |
| `1cddba36` | fix(plan): restore alphabetical import order in register-plugins (chatsRoutes < commandsRoutes) | build-integrity (dprint follow-up) |

### Build-integrity fixes

| Fix | Source issue | File:line | Resolution in `4a1f56b8` |
|---|---|---|---|
| Unused `t` import | `49dd182` | `src/routes/commands/index.ts:19` | Dropped `t,` from `import { Elysia, t, } from "elysia"` → `import { Elysia, } from "elysia"`. |
| Undefined `chatSectionsRoutes` | `2c747e0` | `src/app/register-plugins.ts:150` | Added `import { chatSectionsRoutes, } from "../routes/chat-sections";` (alphabetically placed between `chatSearchRoutes` and `chatsRoutes`; dprint follow-up in `1cddba36` moved `chatsRoutes` above `commandsRoutes` to restore order). |
| Missing `CompleteGenerationOpts` import | `7bb2bdf` | `src/generation/auto-gen/post-store.test.ts:32` | Changed import path from `"../cancellation-tracker/lifecycle"` to `"../cancellation-tracker/types"` (the type lives in `types.ts`; `lifecycle.ts` exports the runtime function `completeGeneration`). |
| `plan:sync --fix` mass-creates orphan issues | `4bc4b34` | `scripts/sync-ticket-index.ts:252-273` | Removed the `execSync('git issue create …')` branch in `applyFixes()` and replaced it with `report.fixesApplied.push(...SKIPPED...) + continue` — placeholder hashes are now logged as skipped, not mass-created. |

## Residual follow-ups

None. Each ticket in this bucket is fully closed by the listed commit(s); the
related cluster (`.plan/backlog/open-build-integrity.md`) carries remaining
build-integrity work outside the Bucket X scope and is tracked separately.

## Status

Bucket X: ✅ **Done** (committed to `dev`). 1 fix commit (`4a1f56b8`) +
1 dprint follow-up (`1cddba36`). All four Bucket X BUG tickets flipped to
Resolved with `## Resolution` blocks referencing the fix commits. The
`.plan/tickets/index.json` index already reflects the four new ticket
filenames (regenerated alongside commit `85e3f041`).

## Related

- `.plan/backlog/open-build-integrity.md` — cluster parent (open follow-ups live here).
- `.plan/backlog/bucket-A-security-perf-close-out-2026-09-03.md` — sibling Bucket A close-out (template this doc mirrors).
- `.plan/tickets/BUG-routes-commands-index-ts-19-has-unused-import-t.md` — ticket 1/4.
- `.plan/tickets/BUG-register-plugins-150-references-undefined-chatsectionsroutes.md` — ticket 2/4.
- `.plan/tickets/BUG-post-store-test-ts-32-imports-missing-completegenerationopts.md` — ticket 3/4.
- `.plan/tickets/BUG-plan-sync-fix-mass-creates-orphan-git-issues-for-placeholder.md` — ticket 4/4.
- git issue `49dd182` / `2c747e0` / `7bb2bdf` / `4bc4b34` — sibling-cluster issues.
