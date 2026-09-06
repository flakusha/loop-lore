# BUG: Model comparisons analytics leaks all users' rows — missing user_id filter

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Medium

## Summary

src/routes/model-comparisons.ts:166 — GET /analytics/comparisons selects ALL users' rows despite docstring 'for the authenticated user'; cross-user data leak. Fix: add .where('user_id','=',userId). Related same file: :37 hand-rolled body validation bypassing TypeBox layer + ctx typed Record<string,unknown> (Elysia skips body validation); :36 messageId not verified to belong to userId (forged analytics); :96 route declares 200 but returns 201 (OpenAPI lies); :131 avgConfidence NaN from null SUM/AVG row.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Fixed in src/routes/model-comparisons.ts (round-7 worktree): GET list + leaderboard scoped to the authenticated user; POST verifies messageId ownership via chats.created_by join; avgConfidence null-guarded for empty groups; OpenAPI response corrected to 201. (resolved 2026-09-06)
