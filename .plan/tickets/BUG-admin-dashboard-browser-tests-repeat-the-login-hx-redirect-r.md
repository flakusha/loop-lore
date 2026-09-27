<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Admin dashboard browser tests repeat the login HX-Redirect race fixed elsewhere

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:** admin dashboard browser tests repeat the login hx redirect r
**Context:** Context: e0ba5f698/c565c81ab.
**Acceptance Criteria:** waitForURL('/views/chat') before goto in both files.

## Summary

Context: e0ba5f698/c565c81ab. Severity: nit (test-infra). tests/e2e/flows/browser/admin-dashboard-empty.browser.ts:33 and admin-dashboard-populated.browser.ts:140 waitForResponse on login POST then immediately page.goto('/views/admin') — login returns HX-Redirect: /views/chat (routes/auth/session.ts:95) and the same abort race c565c81ab fixed in access-correctness.browser.ts:61. Fix: waitForURL('/views/chat') before goto in both files.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
