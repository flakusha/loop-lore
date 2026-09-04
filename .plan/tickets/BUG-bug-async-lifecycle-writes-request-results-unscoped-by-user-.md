# BUG: BUG: async lifecycle writes request_results unscoped by user (cross-user overwrite)

**Status:** ✅ Resolved (already on dev, 2026-09-04)
**Priority:** high
**Effort:** Medium

## Summary

src/middleware/lifecycle.ts recordLifecycle (lines 57-82) passes the client-chosen requestId (from X-Request-Id, honored verbatim by request-id middleware when it matches the safe regex) to asyncStore.complete/fail; src/async/apply.ts then runs updateTable(request_results).where(id, write.id) with NO user_id filter. A client can send X-Request-Id equal to another users in-flight async id and overwrite/fail that row. Currently latent because track() rows are never created (see separate ticket), but the write path is unscoped. Fix: scope complete/fail/progress writes by user_id and verify ownership before update, or derive the id from an authenticated server-generated value.

## Resolution

Already fixed in dev by `97cc60d3` (fix(async): scope complete/fail/progress writes by user_id; thread owner through lifecycle). Verified 2026-09-04 against current `dev` (`7c76aed4`):

- `src/async/apply.ts` — `executeScopedByUser(where, userId)` chains a `user_id` WHERE clause for authenticated writes (progress/complete/fail), and falls back to `id`-only for anonymous (`userId === null`) rows where SQL `NULL = NULL` is false.
- `src/middleware/lifecycle.ts` — `resolveOwner(request)` reads the auth-derived `x-user-id` header (stripped by elysia-app on failed auth), so ownership cannot be spoofed.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
