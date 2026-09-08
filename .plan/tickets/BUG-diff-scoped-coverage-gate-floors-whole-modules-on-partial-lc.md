<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Diff-scoped coverage gate floors whole modules on partial lcov

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

check-parallel DIFF_BASE coverage gate runs scoped bun test --isolate --coverage (overwrites lcov with partial data) then coverage.mjs --floor=80 --only=diff-modules floors whole-module line counts. Scoped tests can never cover 80 percent of assistant/routes/test-utils (e.g. 4 workflow test files cover 23 percent of assistant). Gate structurally unpassable; blocks every finalize. Full-mode has the inverse problem. Fix belongs to check-gate-unblock: floor only diff-touched files, or gate on full-suite lcov without regenerating it scoped.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
