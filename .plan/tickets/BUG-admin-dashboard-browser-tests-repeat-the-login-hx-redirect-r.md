<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Admin dashboard browser tests repeat the login HX-Redirect race fixed elsewhere

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-frontend-admin.md
**Tags:** frontend-admin

**Summary:** admin dashboard browser tests repeat the login hx redirect r
**Context:** Context: e0ba5f698/c565c81ab.
**Acceptance Criteria:** waitForURL('/views/chat') before goto in both files.

## Summary

Context: e0ba5f698/c565c81ab. Severity: nit (test-infra). tests/e2e/flows/browser/admin-dashboard-empty.browser.ts:33 and admin-dashboard-populated.browser.ts:140 waitForResponse on login POST then immediately page.goto('/views/admin') — login returns HX-Redirect: /views/chat (routes/auth/session.ts:95) and the same abort race c565c81ab fixed in access-correctness.browser.ts:61. Fix: waitForURL('/views/chat') before goto in both files.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

// hint: All three dimensions conflict. Manual review required.
Both call sites now wait for the login navigation before `goto`: `admin-dashboard-empty.browser.ts` and the **inline non-admin login** in `admin-dashboard-populated.browser.ts`. Only that file's `loginAsAdmin` helper already had the guard — that is the `c565c81ab` fix, and it is why the file looked covered; the non-admin path did not have it.

The race was not merely flaky: without the guard the non-admin test's post-goto assertion `waitForURL(url => url.pathname !== "/views/admin")` passes **vacuously** when the competing `HX-Redirect: /views/chat` aborts the `goto`, so the admin guard under test was never exercised.

Verified in `fcac83de9`: both files green (`1 pass` / `3 pass`) against the committed tree, plus a 5x repeat of the populated file because the reported symptom was intermittent; `typecheck - backend` covers `tests/**`, so the `waitForURL` predicate is type-checked.
