<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: typecheck scripts/worktree: ReferenceError-class bugs ship green

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

scripts/ is in no tsconfig (tsconfig.backend.json include=src/**), so the worktree CLI has zero static analysis. Four commands shipped unimported identifiers that crash at runtime with ReferenceError: remove.ts (fixed 5de030fc), merge.ts + commit-branch.ts sibling-fallback + report.ts fallback (fixed 25908292). All four were exercised: remove crashed live; merge/commit-branch crashed only when hitting fallback paths. Fix direction: add a dedicated check gate that runs tsc over scripts/worktree with a scoped tsconfig (prototype: .tmp/tsconfig.scripts-check.json extending tsconfig.backend.json, include scripts/worktree/**), initially failing only on TS2304/TS2552 (unresolved names) - the dir carries ~92 accepted strict-mode debt errors (TS2532/TS6133/TS18048/TS2345) plus 6 TS2694 loadConfig type-position artifacts that must not block.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
