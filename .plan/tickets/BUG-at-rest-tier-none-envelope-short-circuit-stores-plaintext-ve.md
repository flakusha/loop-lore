<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: At-rest tier-none envelope short-circuit stores plaintext verbatim and fabricates wasEncrypted: true

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Location: src/crypto/at-rest.ts:82-84.

Evidence: isEncryptedPayload(plaintext) runs BEFORE the switch (encryptionLevel) at :86, so a tier-none message whose text coincidentally matches the {enc, nonce, algo, key_id} envelope shape is stored verbatim (:83), reported as wasEncrypted: true, and later decryptAtRest throws on it - the message is permanently unrenderable. The case none branch (:87-88) is unreachable for envelope-shaped plaintext.

Verification: CODE-READ - at-rest.ts:76-88 re-read verbatim this session: :82-84 (envelope short-circuit returning wasEncrypted true) precedes the switch at :86 whose case none is at :87-88. Crafting a colliding envelope at runtime requires the write+read pipeline live; the ordering is fully determined by the read.

Impact: user-authored text matching the envelope shape becomes permanently unreadable at tier none, and metadata (wasEncrypted) is fabricated. Decryption itself fails closed.

Fix: honor the envelope only for tiers that actually encrypt, and only when key_id belongs to this chat.

Related: TASK-property-test-the-isencryptedpayload-predicate-against-the-d (2284e69, open) - property tests would pin the predicate; this ticket is the ordering defect itself.

Source: .tmp/glm-review/deep-story-crypto-1015.md F-10 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
