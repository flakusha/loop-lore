<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: register-plugins:150 references undefined chatSectionsRoutes

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

`bunx tsc --noEmit -p tsconfig.backend.json` fails on `dev` (`6c55ed8c`):

```
src/app/register-plugins.ts(150,11): error TS2552: Cannot find name 'chatSectionsRoutes'. Did you mean 'chatPinRoutes'?
```

`src/app/register-plugins.ts:150` references `chatSectionsRoutes` which is not in scope. The error hint suggests `chatPinRoutes` as the actual identifier. Likely a rename/regression from one of the active parallel worktrees that touched `register-plugins.ts` (`fix-alpine-chat-view-crash`, `fix-chat-swipe-index-race`, `fix-message-seen-delete-idor`, `fix-table-backend-user-leak` — all 4 share this file in their scope).

## Acceptance Criteria

- [ ] `register-plugins.ts:150` references a defined route handler
- [ ] `bunx tsc --noEmit -p tsconfig.backend.json` no longer flags this file
- [ ] Identify which worktree introduced the breakage (likely one of the 4 active parallel)
- [ ] /fix in that worktree if still active; backport if already finalized

## Related

Discovered during Bucket D audit (2026-09-03). Filed while dev was 154+ commits ahead of origin with `bun run check` gate skipped on finalize (most commits are docs-only); the 3 typecheck errors slipped in during this skip window. Related: see also `BUG-post-store-test-ts-32-imports-missing-completegenerationopts.md` and `BUG-routes-commands-index-ts-19-has-unused-import-t.md`.


git issue: 0b9a09b
