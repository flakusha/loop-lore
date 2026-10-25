<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: rotateKeyOnLeave re-encrypts asset files before the DB transaction, so a rollback permanently destroys encrypted chat assets

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — LIVE confirmed on tip — repro (trigger RAISE(ABORT) on the chat_keys swap; asset file undecryptable with the old key: "Decryption failed ... wrong key") failed pre-fix; reEncryptChatAssets now stages re-encrypted blobs at temp paths (src/crypto/key-rotation/re-encrypt.ts:134-147,201-211) and doRotate renames them into place only after the transaction commits, deleting them on any pre-commit failure (src/crypto/key-distribution.ts:52-71,176-260). 4/4 rotation-proofs + 7/7 re-encrypt + 23/23 chat-lifecycle tests green, gates green 2026-10-25, branch fix/bug-sweep.
**Priority:** critical
**Effort:** Medium
**Epic:** epic-encryption-workflow

**Summary:**

Location: src/crypto/key-distribution.ts:178-197 (assets) then :207-240 (transaction); in-place write at src/crypto/key-rotation/re-encrypt.ts:190.

Evidence: reEncryptChatAssets runs BEFORE the transaction (key-distribution.ts:182-189) and writes ciphertext in place (writeFileSync(filePath, result.data) at re-encrypt.ts:190). If the transaction throws (any message re-encrypt failure throws at key-distribution.ts:221-223), the chat_keys id/key swap (:226-230) rolls back - the DB then references the OLD key while the asset files on disk hold NEW-key ciphertext, and the old key material was overwritten by the swap: every chat asset becomes permanently undecryptable. The code comment at :178-181 names this hazard and proceeds. reEncryptChatAssets also never restores already-rewritten files when a later asset fails (:193-195 only accumulates failures).

Verification: CODE-READ - full write/txn trace: key-distribution.ts:182-189 (assets before txn) -> re-encrypt.ts:189-191 (in-place write) -> key-distribution.ts:207 (transaction starts) -> :221-223 (throw) -> :226-230 (swap rolls back). Executing needs a provisioned encrypted chat + keys + DB; infeasible read-only.

Impact: irreversible data loss for encrypted chats on a partial rotation failure.

Fix: write re-encrypted blobs to a temp path; renameSync into place only after the transaction commits; delete temp files on any pre-commit failure.

Related Done tickets that did not close this: BUG-rotatekeyonleave-partial-failure-leaves-mixed-key-state-non- (d503b9c) and BUG-crypto-asset-re-encryption-runs-inside-db-transaction-rollba (2fa7280) - both predate the current before-txn file-write ordering.

Source: .tmp/glm-review/deep-story-crypto-1015.md F-1 (report is gitignored; finding recorded here verbatim).

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): resolved 2026-10-25 (`fix/bug-sweep`) — LIVE confirmed on tip — repro (trigger RAISE(ABORT) on the chat_keys swap; asset file undecryptable with the old key: "Decryption failed ... wrong key") failed pre-fix; reEncryptChatAssets now stages re-encrypted blobs at temp paths (src/crypto/key-rotation/re-encrypt.ts:134-147,201-211) and doRotate renames them into place only after the transaction commits, deleting them on any pre-commit failure (src/crypto/key-distribution.ts:52-71,176-260). 4/4 rotation-proofs + 7/7 re-encrypt + 23/23 chat-lifecycle tests green, gates green 2026-10-25, branch fix/bug-sweep.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 5b447f9 (registry tip: bcd590b4a Konstantin Fedotov Close issue)
