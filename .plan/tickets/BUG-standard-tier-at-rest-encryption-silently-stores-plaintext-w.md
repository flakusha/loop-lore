# BUG: Standard-tier at-rest encryption silently stores plaintext when SMK unset

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/crypto/at-rest.ts:77 — isEncryptionEnabled()=false → passthrough; config says encrypted, DB gets cleartext, no error/warning. Fix: throw or hard-fail when level=standard and SMK missing.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
