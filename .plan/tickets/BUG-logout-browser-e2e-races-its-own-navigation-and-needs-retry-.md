<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Logout browser e2e races its own navigation and needs retry-on-abort

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

`waitForURL` is called bare at `tests/e2e/flows/browser/auth-session.browser.ts:81` while a logout-triggered navigation is in flight, yielding `net::ERR_ABORTED; maybe frame was detached?` and failing 'Logout > logout returns to login and protects authed views'.

Measured: 1 failure in 6 consecutive runs of the file, same worktree, same code, no env variation — an ~17% flake rate.

Fix direction: retry-on-abort around the navigation wait, not a bare `waitForURL` and not a blanket suite-wide retry.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
