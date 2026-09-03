<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: routes/commands/index.ts:19 has unused import t

**Status:** ✅ Resolved (commit `4a1f56b8`)
**Priority:** medium
**Effort:** Trivial

## Summary

`bunx tsc --noEmit -p tsconfig.backend.json` fails on `dev` (`6c55ed8c`):

```
src/routes/commands/index.ts(19,18): error TS6133: 't' is declared but its value is never read.
```

`src/routes/commands/index.ts:19` imports the Elysia TypeBox builder `t` but never uses it. Unused-import lint/typecheck violation.

## Resolution

Fixed in commit `4a1f56b8` (fix(plan): resolve Bucket X build integrity):

```diff
-import { Elysia, t, } from "elysia";
+import { Elysia, } from "elysia";
```

`src/routes/commands/index.ts:19` now imports only `Elysia`; the unused Elysia TypeBox builder `t` has been removed. The route handlers continue to work without a behavior change — all request bodies keep their existing primitive schemas (`ErrorResponse`, `SuccessResponse`) imported from `../../validation/schemas/primitives`.

Bucket X close-out: `.plan/backlog/bucket-x-build-integrity-close-out-2026-09-03.md`.

git issue: 2226309

## Acceptance Criteria

- [x] Remove the unused `t` import from `src/routes/commands/index.ts:19`
- [x] `bunx tsc --noEmit -p tsconfig.backend.json` no longer flags this file
- [x] Verify route handlers still validate correctly (no behavior change)

## Related

Discovered during Bucket D audit (2026-09-03). File is in the shared scope of all 4 active parallel worktrees; whoever removes it first wins. Related: see also `BUG-register-plugins-150-references-undefined-chatsectionsroutes.md` and `BUG-post-store-test-ts-32-imports-missing-completegenerationopts.md`.

