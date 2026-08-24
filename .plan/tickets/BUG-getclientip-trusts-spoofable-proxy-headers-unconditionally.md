# BUG: getClientIp trusts spoofable proxy headers unconditionally

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/auth/shared.ts:54-56 — trusts X-Forwarded-For/x-real-ip/CF-Connecting-IP whenever remoteAddress absent → login rate-limit bypass via header rotation; attacker-controlled IP stored in sessions rows. Fix: only trust these headers behind known proxy (config flag). Related minors: rate-limit.ts:41 fixed window mislabeled sliding + burst across boundary, keyed on spoofable IP; shared.ts:217 Secure cookie only when NODE_ENV=production (LL_COOKIE_SECURE override easy to forget).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
