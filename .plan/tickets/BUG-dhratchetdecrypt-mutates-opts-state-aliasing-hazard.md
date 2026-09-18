<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: dhRatchetDecrypt mutates opts.state (aliasing hazard)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done (fixed by f69d0229)
**Priority:** medium
**Effort:** Medium

## Summary

In src/crypto/e2e/dh-ratchet.ts, dhRatchetDecrypt continuation branch assigns workingState = state then mutates receivingChainKey/recvCount (and fill(0)), aliasing the callers input. dhRatchetEncrypt copies; decrypt should too. Fix: workingState = { ...state }. Latent bug if a caller retains the input state. Tests use the returned state so unaffected.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
