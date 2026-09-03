<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: routes/commands/index.ts:19 has unused import t

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Trivial

## Summary

`bunx tsc --noEmit -p tsconfig.backend.json` fails on `dev` (`6c55ed8c`):

```
src/routes/commands/index.ts(19,18): error TS6133: 't' is declared but its value is never read.
```

`src/routes/commands/index.ts:19` imports the Elysia TypeBox builder `t` but never uses it. Unused-import lint/typecheck violation.

## Acceptance Criteria

- [ ] Remove the unused `t` import from `src/routes/commands/index.ts:19`
- [ ] `bunx tsc --noEmit -p tsconfig.backend.json` no longer flags this file
- [ ] Verify route handlers still validate correctly (no behavior change)

## Related

Discovered during Bucket D audit (2026-09-03). File is in the shared scope of all 4 active parallel worktrees; whoever removes it first wins. Related: see also `BUG-register-plugins-150-references-undefined-chatsectionsroutes.md` and `BUG-post-store-test-ts-32-imports-missing-completegenerationopts.md`.
