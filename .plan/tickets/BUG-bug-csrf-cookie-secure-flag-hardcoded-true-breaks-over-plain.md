# BUG: BUG: CSRF cookie Secure flag hardcoded true; breaks over plain HTTP

**Status:** ✅ Fixed (ccac5b9d server + fix-review-quickwins clients)
**Priority:** medium
**Effort:** Medium

## Summary

src/middleware/csrf.ts cookieForDecision uses resolveCookieSecure(opts.cookieSecureOverride, opts.cookieSecureInProd ?? true) so Secure is always true unless cookieSecureOverride is explicitly false. There is no NODE_ENV / LL_COOKIE_SECURE wiring. Over plain HTTP (dev / HTTP deployments) a Secure cookie is never stored by the browser, so the csrf_token cookie is never set and every unsafe request fails CSRF verification (403). Fix: drive Secure from NODE_ENV === production unless overridden, mirroring src/routes/auth/shared.ts setTokenCookie.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
