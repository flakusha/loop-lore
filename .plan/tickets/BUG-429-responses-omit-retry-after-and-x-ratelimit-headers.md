# BUG: 429 responses omit Retry-After and X-RateLimit headers

**Status:** done

**Priority:** medium
**Effort:** Medium

## Summary

src/routes/auth/login.ts (L23-31) and src/routes/auth/register.ts (L70-78) return 429 without a Retry-After header and emit no X-RateLimit-Limit/Remaining/Reset. The limiter API rate-limit.ts check() (L37) returns only boolean, so the reset time is not derivable. IMPACT: clients (incl. htmx) cannot know when to retry; violates RFC 6585 guidance for 429; no rate-limit observability. FIX: extend check() to return { allowed, retryAfterSec, limit, remaining, resetAt } (or a read-only peek). Emit Retry-After + X-RateLimit-* on both 429 and success paths.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
