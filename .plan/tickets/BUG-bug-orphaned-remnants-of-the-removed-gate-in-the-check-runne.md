<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: orphaned remnants of the removed `test - unit` gate in the check runner (dead SCOPED_TESTS, stale HEAVY_NAMES entry, stale comment)

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-cicd-pipeline

**Summary:**

**Summary:** Commit 961580d98 removed the `test - unit` gate from the check-runner registry but left three pieces of its corpse behind, so the runner describes behavior that no longer exists.

**Context:** Found 2026-10-04 during investigation of BUG-e2e-browser-baseline-gate-ignores-diff-base-while-the-covera. 961580d98 is an ancestor of dev.

**Acceptance Criteria:**
- [ ] `scopedTestFiles` and `SCOPED_TESTS` removed from scripts/check/parallel/context.mjs:92-109 and :174
- [ ] The stale `test - unit` entry removed from the HEAVY_NAMES set in scripts/check/parallel/runner.mjs
- [ ] The comment at scripts/check/parallel/context.mjs:20-24 corrected to describe what the runner actually does
- [ ] No gate in the registry is silently missing from heavy-gate serialization

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue f6705a5 (registry tip: ccbdc5d8b Konstantin Fedotov Close issue)
