<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: orphaned remnants of the removed `test - unit` gate in the check runner (dead SCOPED_TESTS, stale HEAVY_NAMES entry, stale comment)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

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
