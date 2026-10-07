<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Alpine hydration failures (undeclared template vars) untested

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

BUG-alpine-init-hydration records undeclared Alpine template vars (showGmPanel, \_moodPanel, \_searchResults) failing to hydrate. No browser test catches this class of failure.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Reproduce: a page whose template references an undeclared Alpine var fails to hydrate.
- [ ] Browser e2e asserts hydration for each affected panel (or a generic hydration smoke).
- [ ] Fix the undeclared vars or add a lint/check that fails on template vars absent from the Alpine component.
- [ ] bun run check green.

**Related:** .plan/epics/epic-testing-qa.md
