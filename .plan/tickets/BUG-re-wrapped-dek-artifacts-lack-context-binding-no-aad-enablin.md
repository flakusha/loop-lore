<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Re-wrapped DEK artifacts lack context binding (no AAD), enabling cross-chat key confusion on import

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Tags:** security, federation

**Summary:**

RewrappedDek carries chatId/keyId/senderOrigin as plaintext fields next to wrappedKey (src/federation/dek-rewrap.ts:42-53); the seal has no AAD (dek-rewrap.ts:97; the ContentCipher seam in src/federation/cipher.ts exposes no AAD parameter). importChatDek trusts artifact.chatId/keyId verbatim, onConflict(chat_id).doNothing is first-import-wins, and senderOrigin/wrappedAt are never validated (dek-rewrap.ts:195-211). Anyone holding a receiver's inbound content key can seal a DEK it knows and label it as any chat lacking a chat_keys row; the receiver installs it as that chat's authoritative key and the later genuine artifact is ignored - cross-chat key confusion and persistent decryption failure for that chat's replicated content. No production callers yet (repo-wide grep matches tests and defining modules only), so the protocol shape is still cheap to fix. Fix: add AAD to the cipher seam and bind chatId+keyId+senderOrigin on both sides; verify senderOrigin against a known peering at import.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
