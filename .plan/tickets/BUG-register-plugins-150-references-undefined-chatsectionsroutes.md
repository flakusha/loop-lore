<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: register-plugins:150 references undefined chatSectionsRoutes

**Status:** ✅ Resolved (commit `4a1f56b8`, follow-up `1cddba36`)
**Priority:** high
**Effort:** Small

## Summary

`bunx tsc --noEmit -p tsconfig.backend.json` fails on `dev` (`6c55ed8c`):

```
src/app/register-plugins.ts(150,11): error TS2552: Cannot find name 'chatSectionsRoutes'. Did you mean 'chatPinRoutes'?
```

`src/app/register-plugins.ts:150` references `chatSectionsRoutes` which is not in scope. The error hint suggests `chatPinRoutes` as the actual identifier. Likely a rename/regression from one of the active parallel worktrees that touched `register-plugins.ts` (`fix-alpine-chat-view-crash`, `fix-chat-swipe-index-race`, `fix-message-seen-delete-idor`, `fix-table-backend-user-leak` — all 4 share this file in their scope).

## Resolution

Fixed in commit `4a1f56b8` by adding the missing import:

```diff
+import { chatSectionsRoutes, } from "../routes/chat-sections";
```

The route module exists at `src/routes/chat-sections/`; the symbol was simply not imported in `register-plugins.ts`. The new import was placed between `chatSearchRoutes` and `commandsRoutes` per the alphabetical convention.

A dprint follow-up in commit `1cddba36` corrected the import-order drift introduced by the new line — `chatsRoutes` was moved above `commandsRoutes` to restore alphabetical order (`chatSearchRoutes` < `chatSectionsRoutes` < `chatsRoutes` < `commandsRoutes`).

`src/app/register-plugins.ts:150` now references the imported route handler and `bunx tsc --noEmit -p tsconfig.backend.json` no longer flags the file.

Bucket X close-out: `.plan/backlog/bucket-x-build-integrity-close-out-2026-09-03.md`.

git issue: 0b9a09b

## Acceptance Criteria

- [x] `register-plugins.ts:150` references a defined route handler
- [x] `bunx tsc --noEmit -p tsconfig.backend.json` no longer flags this file
- [x] Identify which worktree introduced the breakage (likely one of the 4 active parallel)
- [x] /fix in that worktree if still active; backport if already finalized

## Related

Discovered during Bucket D audit (2026-09-03). Filed while dev was 154+ commits ahead of origin with `bun run check` gate skipped on finalize (most commits are docs-only); the 3 typecheck errors slipped in during this skip window. Related: see also `BUG-post-store-test-ts-32-imports-missing-completegenerationopts.md` and `BUG-routes-commands-index-ts-19-has-unused-import-t.md`.

