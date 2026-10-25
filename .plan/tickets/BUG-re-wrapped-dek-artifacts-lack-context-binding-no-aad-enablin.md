<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Re-wrapped DEK artifacts lack context binding (no AAD), enabling cross-chat key confusion on import

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — AAD context binding + peering verification, both sides — (1) cipher seam: `ContentCipher.seal/open` take optional `aad` (src/federation/cipher.ts:17-33), threaded through `pskCipher` into `encryptValue`/`decryptValue` (src/crypto/byok.ts:83-133 — optional AES-GCM additionalData; omitted = legacy behavior, so existing ciphertexts stay readable); envelope callers unchanged. (2) dek-rewrap: export seals under `dekAad(chatId, keyId, senderOrigin)` (src/federation/dek-rewrap.ts:56-70, JSON-array form so origin colons stay unambiguous); `openRewrappedDek` (:168-181) derives the AAD from the artifact's own fields — a re-labeled artifact fails GCM authentication instead of installing a mislabeled key; `importChatDek` (:198-232) refuses non-canonical senderOrigins and origins with no recorded `mesh_peers` row BEFORE opening anything. Scope notes: wrappedAt freshness is NOT enforced (the ticket's fix sentence binds chatId+keyId+senderOrigin and verifies senderOrigin; a freshness policy needs a chosen skew window — operator decision, deliberately left out); `onConflict(chat_id).doNothing` first-import-wins stays (documented receiver contract, now only reachable from verified peers). Tests (src/federation/dek-rewrap.test.ts, 11/11): re-labeled artifact (same holding cipher) opens genuine but fails on chatId/keyId/senderOrigin relabel — before-evidence captured: it OPENED pre-fix (run 1792911929); import from an origin with no peering rejects `/no peering/` and installs nothing — before-evidence: it SUCCEEDED pre-fix (run 1792911906); three existing import tests updated to seed the peering (insertMeshPeers). byok.test.ts 14/14 (back-compat). Gates green (run 853647-mvnhn04r). Worktree fix/bug-sweep, issue BUG-RE-WRAPPED-DEK-ARTIFACTS-LACK-CONTEXT-BINDING-NO-AAD-ENABL.
**Priority:** high
**Effort:** Medium
**Epic:** epic-chat-context-optimization
**Tags:** security, federation

**Summary:**

RewrappedDek carries chatId/keyId/senderOrigin as plaintext fields next to wrappedKey (src/federation/dek-rewrap.ts:42-53); the seal has no AAD (dek-rewrap.ts:97; the ContentCipher seam in src/federation/cipher.ts exposes no AAD parameter). importChatDek trusts artifact.chatId/keyId verbatim, onConflict(chat_id).doNothing is first-import-wins, and senderOrigin/wrappedAt are never validated (dek-rewrap.ts:195-211). Anyone holding a receiver's inbound content key can seal a DEK it knows and label it as any chat lacking a chat_keys row; the receiver installs it as that chat's authoritative key and the later genuine artifact is ignored - cross-chat key confusion and persistent decryption failure for that chat's replicated content. No production callers yet (repo-wide grep matches tests and defining modules only), so the protocol shape is still cheap to fix. Fix: add AAD to the cipher seam and bind chatId+keyId+senderOrigin on both sides; verify senderOrigin against a known peering at import.

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): AAD context binding + peering verification, both sides — (1) cipher seam: `ContentCipher.seal/open` take optional `aad` (src/federation/cipher.ts:17-33), threaded through `pskCipher` into `encryptValue`/`decryptValue` (src/crypto/byok.ts:83-133 — optional AES-GCM additionalData; omitted = legacy behavior, so existing ciphertexts stay readable); envelope callers unchanged.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 93dae7b (registry tip: 8755515bb Konstantin Fedotov Close issue)
