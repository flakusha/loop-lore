# BUG: Idempotency cache key lacks user scope — cross-user response replay

**Status:** ✅ Fixed (worktree fix-idempotency-user-scoping)
**Priority:** high
**Effort:** Medium

## Summary

In src/middleware/idempotency.ts:67-69, makeKey() builds the idempotency cache key as 'METHOD routePattern requestId' with NO user scoping. Any two users sharing the same X-Request-Id header value (or both with no header → server-generated UUID) can replay each other's cached responses. Fix: include userId (or an auth-derived scope) in the cache key. Privacy/security impact: a user could observe another user's response body if they guess/brute-force a colliding requestId. The body is filtered (Set-Cookie stripped) but the response payload (e.g. generated chat message text, file metadata) is leaked.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing (added cross-user isolation test in idempotency.test.ts)
- [ ] Documentation updated


