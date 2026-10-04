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

## Resolution

Fix landed; not yet proven. Verified by reading the code only.

- `tests/e2e/flows/browser/auth-session.browser.ts:59` defines `waitForUrlWithRetry`, which retries only the transient abort shape and re-throws anything else, preserving genuine errors (`:72` — `if (!/ERR_ABORTED|frame was detached|navigating/i.test(message,)) { throw error; }`).
- The logout flow uses that helper in place of the bare `waitForURL` (`:109`), so the wait tolerates the navigation it triggers itself.
- The flake is addressed by tolerating navigation-aborted errors at the wait, NOT by a repeated-run soak. No e2e soak has been performed on this branch, so the ~17% flake rate recorded in the summary has not been re-measured after the fix.

The ticket stays open until the browser e2e is actually run. Closing it requires either a green auth-session browser run or a repeated-run measurement showing the flake is gone.
