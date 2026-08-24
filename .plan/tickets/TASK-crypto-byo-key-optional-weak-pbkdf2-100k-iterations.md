# TASK: Crypto: BYO key optional/weak + PBKDF2 100k iterations

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/config/sections/byo-key.ts:20 and src/crypto/byok.ts:43 encryptionKey optional with no length/placeholder check, byoKey.enabled defaults true (weak key silently accepted); src/crypto/byok.ts:28 PBKDF2 only 100k iterations (below OWASP 600k). Fix: validateByoKeySafety requiring >=32 when enabled; raise to >=600k or Argon2id. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
