<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add a pre-merge conflict-marker scan to the check or hook path

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Tags:** infra

**Summary:**

Conflict markers reached dev twice in the 2026-10-01..04 window: 82124d0b5 left markers in .plan-managed files and entities.ts carried an unbounded keywords update schema on the losing side for about two days; ab4fc259a committed markers in locale/UI files (fixed by 668097e8f). A cheap pre-merge scan - git grep -nE '^(<{7} |={7}$|>{7} )' over src/ and docs/ - would have caught both. Candidate homes: the .githooks/pre-commit staged-file path or a check-runner gate. Effort small.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
