# BUG: Demo login endpoint bypasses rate limiter

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/routes/auth/login.ts handleDemoLogin (L127-184) creates a full sessions row + signed JWT with NO loginLimiter.check(ip) call, unlike handleLogin (L23) which enforces it. IMPACT: an unauthenticated endpoint can mint unlimited demo sessions -> sessions-table growth, JWT-signing load, resource exhaustion / abuse, and no brute-force throttle. FIX: apply loginLimiter.check(ip) (or a dedicated demo limiter with appropriate limits) at the top of handleDemoLogin before any DB write.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
