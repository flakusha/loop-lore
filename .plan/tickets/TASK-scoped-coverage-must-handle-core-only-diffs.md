<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Scoped coverage must handle core-only diffs

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-cicd-pipeline
**Caveats:** partial failure, stale state, observability

**Context:**

A core-only diff maps to a nonexistent source directory and reports a no-op pass.

**Summary:**

A core-only diff is not floored correctly because the scoped-coverage path maps it to a nonexistent source directory and reports a no-op pass.

**Scope:**

- Add `packages/core/src/` to scoped-coverage filtering.
- Add a regression test for a core-only diff.
- Do not reopen the already-fixed whole-module scoped-coverage bug as a duplicate.

**Acceptance Criteria:**

- [ ] A core-only fixture diff receives real scoped coverage.
- [ ] The stale-directory no-op path cannot recur silently.
- [ ] Relevant gates pass.

**Related:**

- `BUG-diff-scoped-coverage-gate-floors-whole-modules-on-partial-lc.md`


git issue: 6fd3769
