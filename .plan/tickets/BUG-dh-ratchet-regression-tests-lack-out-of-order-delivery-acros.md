# BUG: dh-ratchet regression tests lack out-of-order delivery across ratchet boundary

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/crypto/e2e/dh-ratchet.bugs.test.ts (added in ad8e01ea) verifies the re-seed fix but has two gaps: (1) no scenario where old-epoch messages arrive out of order (e.g. counter=2 before 0,1), forcing skipOldChain to store skipped keys, then a new-epoch message follows - the case where a wrong fix could pass silently; (2) test calls dhStep() on the sender with the same primitive the receiver uses, so it verifies self-consistency, not spec conformance. Fix: add known-answer vectors or an independent-chain derivation. Found in dev-fix review 2026-09-01.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
