# BUG: InitDhRatchetOpts.theirInitialPub declared but never read

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

In src/crypto/e2e/dh-ratchet.ts, initDhRatchet(opts: InitDhRatchetOpts) receives theirInitialPub: CryptoKey but never uses it. Callers (e2e-session.ts, dh-ratchet.test.ts) pass it. Dead/misleading API. Remove from the interface and callsites, or use it to seed theirCurrentPubJwk.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
