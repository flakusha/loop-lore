# TASK: Frontend exposes session token in localStorage

**Status:** ⬜ Not Started
**Priority:** critical
**Effort:** Medium

## Summary

src/frontend/alpine/transports/server.ts:35 reads localStorage.session_token and sends it in XHR. With CSP unsafe-inline this is trivially exfiltratable via XSS. Fix: move auth to HttpOnly SameSite cookie; never expose token in JS. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
