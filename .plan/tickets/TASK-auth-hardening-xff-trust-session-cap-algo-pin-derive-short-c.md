# TASK: Auth hardening: XFF trust, session cap, algo pin, derive short-circuit, logout verify

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Medium auth gaps from review: getClientIp trusts X-Forwarded-For first hop (rate-limit bypass); maxSessionsPerUser config never enforced; Bun.password.hash uses unpinned default (spec scrypt, plan bcrypt/argon2, impl argon2id); elysia-app.ts derive does not short-circuit on auth failure (structural weakness behind /me bug); handleLogout deletes session from unverified token. Fix each per .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
