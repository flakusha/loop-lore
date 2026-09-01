# BUG: BUG: logout route exempt from CSRF verification (logoff CSRF)

**Status:** ✅ Fixed (ccac5b9d server + fix-review-quickwins clients)
**Priority:** medium
**Effort:** Medium

## Summary

src/middleware/csrf.ts CSRF_EXEMPT_ROUTES includes POST /api/auth/logout. Logout is a state-changing operation; exempting it allows a logoff-CSRF attack (force the victim to log out). The comment claims the session JWT protects it, but CSRF is precisely the scenario where the victim is authenticated. Fix: remove logout from the exempt list and issue/require the CSRF token, or use a same-site-required logout via GET with token.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
