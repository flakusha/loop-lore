# BUG: dhRatchetDecrypt DH-step branch derives message key from stale previous-epoch chain (f69d0229 regression)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

The aliasing fix in f69d0229 removed the load-bearing line 'chainKey = new Uint8Array(workingState.receivingChainKey)' from the new-ephemeral (DH-step) branch of dhRatchetDecrypt. After removal, the chain-advance loop starts from a copy of the PREVIOUS epoch's receivingChainKey instead of dh.sendingChainKey (the new epoch's chain), so the message key is derived from the wrong chain and AES-GCM auth fails. Additionally, workingState.receivingChainKey.fill(0) zeroes the fresh dh.sendingChainKey before it is overwritten, destroying the derived chain-key material. Currently latent: dhRatchetEncrypt never rotates ephemerals, so the branch is unreachable in production and tests (continuation-path only) stay green. Verified by probe: epoch-0 continuation decrypt OK; epoch-1 new-ephemeral decrypt throws 'The operation failed for an operation-specific reason'. Blocks Phase E/F (receiver-side wiring, Signal-grade ratchet) which will activate this branch. Fix: restore chainKey re-assignment to the fresh dh.sendingChainKey inside the DH branch (and keep the clone for aliasing safety); add a DH-step decrypt regression test. Probe: .tmp/dh-branch-probe.ts

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
