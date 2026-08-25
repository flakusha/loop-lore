# BUG: Auth rate-limiter tests seed per-IP buckets via getClientIp internals — no direct bucket isolation

**Status:** ✅ Resolved (2026-08-25, worktree `fix-ratelimiter-global-bucket`)
**Priority:** low
**Effort:** Medium

## Summary

registerLimiter/loginLimiter are module-level singletons keyed by the string getClientIp returns. Tests can only reset them wholesale (resetRegisterRateLimiter); there is no way to assert two distinct IPs occupy distinct buckets without knowing the internal key. After TASK-implement-per-connection-ip-sourcing-for-auth-rate-limiters lands, add assertions that ip=A and ip=B get independent budgets and that spoofed XFF under trustProxy=false maps to the same (connection-derived) key.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
