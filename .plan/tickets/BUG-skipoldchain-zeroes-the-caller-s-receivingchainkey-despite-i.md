<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: skipOldChain zeroes the caller's receivingChainKey despite its does-not-mutate-input contract

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:**

Location: src/crypto/e2e/dh-ratchet-helpers.ts:43-50 (JSDoc contract at :37-38); impact path at src/crypto/e2e/dh-ratchet.ts:181-197.

Evidence: let chainKey: Uint8Array = state.receivingChainKey aliases the caller's buffer; the loop runs chainStep(chainKey) then chainKey.fill(0) - the caller's buffer is zeroed on the first iteration. At the call site skipOldChain(state, ...) at dh-ratchet.ts:181 runs BEFORE the DH step re-seeds workingState.receivingChainKey at :191-197; if importKey (:182) or dhStep (:190) throws, state.receivingChainKey is already zeroed and all later decrypts fail. The caller already makes defensive copies for its own advance loop (:162 comment avoid mutating caller input - aliasing hazard, :165/:172 new Uint8Array(...)) but still passes the raw state into skipOldChain.

Verification: REPRODUCED - probe .tmp/glm-review/verify/skip-old-chain.ts calls the real skipOldChain with a 0xAB-filled 32-byte key: decisive output 'receivingChainKey[0..8] before: ab ab ab ... after: 00 00 00 ...' and 'caller buffer fully zeroed: true' (the function still returned 2 valid skipped keys - it works, it just mutates its input, violating the :37-38 contract).

Impact: a throw in the DH step after a chain skip permanently breaks decryption for the session.

Fix: new Uint8Array(state.receivingChainKey) copy inside skipOldChain.

Source: .tmp/glm-review/deep-story-crypto-1015.md F-7 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
