# TASK: Auth polish: MIME sniff, visibility, last_seen, i18n, cookie, register spec, misc

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Low-severity auth gaps: upload MIME client-asserted not sniffed; asset Shared visibility metadata leak (read.ts:84 vs 194); last_seen_at written every request (throttle); login untranslated error keys; setTokenCookie missing Secure/__Host; register password>=6 vs spec 8 plus missing fields; verifyJwt no alg assert; in-memory rate limiter; sessions.token_hash mislabeled; FORBIDDEN_ROOTS incomplete; asset admin.character reuse. Fix per .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
