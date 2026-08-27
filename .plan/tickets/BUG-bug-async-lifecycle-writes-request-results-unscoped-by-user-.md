# BUG: BUG: async lifecycle writes request_results unscoped by user (cross-user overwrite)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/middleware/lifecycle.ts recordLifecycle (lines 57-82) passes the client-chosen requestId (from X-Request-Id, honored verbatim by request-id middleware when it matches the safe regex) to asyncStore.complete/fail; src/async/apply.ts then runs updateTable(request_results).where(id, write.id) with NO user_id filter. A client can send X-Request-Id equal to another users in-flight async id and overwrite/fail that row. Currently latent because track() rows are never created (see separate ticket), but the write path is unscoped. Fix: scope complete/fail/progress writes by user_id and verify ownership before update, or derive the id from an authenticated server-generated value.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
