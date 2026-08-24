# TASK: Add security regression tests for CRITICAL/HIGH bugs

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Meta-review found NO regression tests for the CRITICAL bugs: /me forged token (e16fb61), verifyJwt missing/past exp + empty payload (b87cc89), CSP_DEFAULTS scriptSrc unsafe-inline/unsafe-eval (0ce5784), story/GM NSFW gate (f0683a8/5232abe), ReDoS lore key + transform pattern (5c73739/1330c1f). Partial for settings mass-assign, telemetry userId, logger censor, RBAC. Add first: (1) /me forged unsigned token returns 401; (2) verifyJwt rejects missing/past exp and empty payload; (3) CSP_DEFAULTS.scriptSrc excludes unsafe-inline/unsafe-eval; (4) story/GM gen blocked when NSFW disallowed; (5) asset upload path-traversal contained. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
