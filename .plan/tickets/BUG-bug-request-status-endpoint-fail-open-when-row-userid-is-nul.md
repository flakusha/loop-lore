# BUG: BUG: request status endpoint fail-open when row userId is null

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/requests/status.ts guards ownership only inside if (row.userId !== null); when a request_results row has userId === null the check is skipped entirely and the row is returned to any caller who knows the id. Fix: when userId is null, return 404 (or require admin) rather than serving the row; do not default-allow.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated

## Resolution

Inverted the ownership guard in `src/routes/requests/status.ts`. Previously the check ran only inside `if (row.userId !== null)` — for anonymous rows the check was skipped entirely, so any caller who knew the id could read it. Replaced with a flat guard: `ownsRow = callerId !== null && callerId === row.userId; isAdmin = ctx.userRole === "admin"`; non-owners and non-admins get 404 (same response as a missing row, so existence is not leaked). Three new cases in `src/routes/requests/status.test.ts` cover the fix: anonymous caller → 404, non-admin authenticated caller → 404, admin → 200. All 8 tests pass (`bun test src/routes/requests/status.test.ts`).
