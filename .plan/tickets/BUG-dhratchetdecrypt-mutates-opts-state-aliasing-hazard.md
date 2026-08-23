# BUG: dhRatchetDecrypt mutates opts.state (aliasing hazard)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

In src/crypto/e2e/dh-ratchet.ts, dhRatchetDecrypt continuation branch assigns workingState = state then mutates receivingChainKey/recvCount (and fill(0)), aliasing the callers input. dhRatchetEncrypt copies; decrypt should too. Fix: workingState = { ...state }. Latent bug if a caller retains the input state. Tests use the returned state so unaffected.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
