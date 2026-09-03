<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: post-store.test.ts:32 imports missing CompleteGenerationOpts

**Status:** ✅ Resolved (commit `4a1f56b8`)
**Priority:** high
**Effort:** Small

## Summary

`bunx tsc --noEmit -p tsconfig.backend.json` fails on `dev` (`6c55ed8c`):

```
src/generation/auto-gen/post-store.test.ts(32,15): error TS2724: '"../cancellation-tracker/lifecycle"' has no exported member named 'CompleteGenerationOpts'. Did you mean 'completeGeneration'?
```

`src/generation/auto-gen/post-store.test.ts:32` imports `CompleteGenerationOpts` from `../cancellation-tracker/lifecycle`, but the export was renamed to `completeGeneration` (likely a function, not the type) or the type was renamed. Test file uses the old name.

## Resolution

Fixed in commit `4a1f56b8` by repointing the import to the module that actually exports the type:

```diff
-import type { CompleteGenerationOpts, } from "../cancellation-tracker/lifecycle";
+import type { CompleteGenerationOpts, } from "../cancellation-tracker/types";
```

The runtime function `completeGeneration` lives in `lifecycle.ts`; the `CompleteGenerationOpts` *type* is declared in `types.ts`. The test was importing the runtime module — TS2724 flagged the missing named export. The type still exists and the test still covers the same behavior (no test rewrite was needed).

`bunx tsc --noEmit -p tsconfig.backend.json` no longer flags this file.

Bucket X close-out: `.plan/backlog/bucket-x-build-integrity-close-out-2026-09-03.md`.

git issue: d660ce1

## Acceptance Criteria

- [x] Test file imports the correct symbol (rename import to `completeGeneration` if it's a function call, or restore the `CompleteGenerationOpts` type export if the API contract is intentional)
- [x] `bunx tsc --noEmit -p tsconfig.backend.json` no longer flags this file
- [x] Test still covers the same behavior

## Related

Discovered during Bucket D audit (2026-09-03). Likely in scope of `fix-table-backend-user-leak` worktree (handles `async/apply.test.ts` and TableBackend cancellation-tracker integration). Related: see also `BUG-register-plugins-150-references-undefined-chatsectionsroutes.md` and `BUG-routes-commands-index-ts-19-has-unused-import-t.md`.

