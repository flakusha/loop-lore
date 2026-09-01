# BUG: BUG: CSRF verification accepts cookie-only token, defeating double-submit

**Status:** ✅ Fixed (ccac5b9d server + fix-review-quickwins clients)
**Priority:** high
**Effort:** Medium

## Summary

src/middleware/csrf.ts decideCsrf: on unsafe methods it sets token = headerToken ?? cookieToken and only compares headerToken vs cookieToken when BOTH are present; when the header is absent the mismatch branch is skipped and verifyCsrfToken(token, binding) verifies the cookie against itself. The csrf_token cookie is non-HttpOnly (frontend reads it), so a request carrying only the cookie (no X-CSRF-Token header) passes. This collapses the documented double-submit requirement to a single cookie. SameSite=Lax limits cross-site exploitation but same-site forged requests (e.g. via XSS or subdomain) still pass. Fix: require BOTH header and cookie to be present and equal (reject when either is missing), or switch to a signed HttpOnly token compared server-side.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
