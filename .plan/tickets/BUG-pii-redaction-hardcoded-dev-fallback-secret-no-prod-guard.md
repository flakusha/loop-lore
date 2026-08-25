# BUG: PII redaction hardcoded dev fallback secret, no prod guard

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/nsfw/pii-redaction.ts:58 — NSFW_PII_SECRET unset → falls back to literal 'nsfw-pii-dev-secret-do-not-use-in-prod'; pseudonymization hashes keyed by publicly-known key in prod with no startup guard (unlike JWT/SMK). Fix: fail closed — throw when env missing in prod.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
