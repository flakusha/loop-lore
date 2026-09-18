<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Diff-scoped coverage gate floors whole modules on partial lcov

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** [OK] Done - fixed on dev (5f145f7d0, verified in-tree 2026-09-16)
**Priority:** Medium
**Effort:** Medium

## Summary

check-parallel DIFF_BASE coverage gate runs scoped bun test --isolate --coverage (overwrites lcov with partial data) then coverage.mjs --floor=80 --only=diff-modules floors whole-module line counts. Scoped tests can never cover 80 percent of assistant/routes/test-utils (e.g. 4 workflow test files cover 23 percent of assistant). Gate structurally unpassable; blocks every finalize. Full-mode has the inverse problem. Fix belongs to check-gate-unblock: floor only diff-touched files, or gate on full-suite lcov without regenerating it scoped.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed on dev by `5f145f7d0` ("floor diff-touched files in scoped coverage"):
the scoped runner passes `--files=<changed src files>` and `coverage.mjs`
floors each diff-touched file individually (unloaded files reported SKIP),
instead of flooring whole-module aggregates from partial lcov. Verified
in-tree: `scripts/check/coverage.mjs:25-33` carries the BUG-37a3763 comment
and `--files=` handling; `5f145f7d0` is in HEAD ancestry. No code change in
this batch.
git issue: 37a3763
