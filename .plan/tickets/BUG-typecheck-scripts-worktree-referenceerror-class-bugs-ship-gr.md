<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: typecheck scripts/worktree: ReferenceError-class bugs ship green

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** high
**Effort:** Medium

## Summary

scripts/ is in no tsconfig (tsconfig.backend.json include=src/**), so the worktree CLI has zero static analysis. Four commands shipped unimported identifiers that crash at runtime with ReferenceError: remove.ts (fixed 5de030fc), merge.ts + commit-branch.ts sibling-fallback + report.ts fallback (fixed 25908292). All four were exercised: remove crashed live; merge/commit-branch crashed only when hitting fallback paths. Fix direction: add a dedicated check gate that runs tsc over scripts/worktree with a scoped tsconfig (prototype: .tmp/tsconfig.scripts-check.json extending tsconfig.backend.json, include scripts/worktree/**), initially failing only on TS2304/TS2552 (unresolved names) - the dir carries ~92 accepted strict-mode debt errors (TS2532/TS6133/TS18048/TS2345) plus 6 TS2694 loadConfig type-position artifacts that must not block.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Added `tsconfig.scripts.json` (extends backend, strict debt relaxed, name
resolution kept) + `typecheck - scripts` gate in `scripts/check-parallel.mjs`
(`bun run check --gates "typecheck - scripts"` green). Fixed two live
ReferenceError-class bugs the first gate run caught: missing `ticket` import
and missing `utils/git` import in `scripts/worktree/index.ts` (both TS2304);
fixed six `import(\"../index\").loadConfig` member errors (TS2694) via a
`loadConfig` + `WorktreeConfig` re-export from `index.ts`, and migrated
`CommandHandler.run` to the named `WorktreeConfig` type per ts-no-return-type.
`bun run scripts/worktree/ list` smoke passes. `bunx tsgo --noEmit -p
tsconfig.scripts.json` -> 0 errors.
