<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Actor-key rotation is a silent no-op that orphans all encrypted history

**Status:** 🟥 Open
**Severity:** Critical
**Priority:** High
**Epic:** epic-crypto
**Related:** TASK-encryption-auto-key-rotation, TASK-encryption-key-rotation

## Summary

`rotateActorKeyAndReEncrypt` generates a new key **before** re-encrypting, and
the re-encrypt step derives the chat key with the *new* actor key, then tries to
decrypt *old* messages with it. GCM auth-tag mismatch → empty `catch` → message
skipped. The old key is never expired. Net effect: rotation re-encrypts nothing,
orphans all history, and leaves the old key active (no forward secrecy).

## Root Causes

1. `src/crypto/key-rotation/rotate.ts:28-58` — calls `generateActorKey`
   directly (step 1) rather than `rotateActorKey`, so the old key stays
   `status="active"`; step 4 only *logs* `oldKey.id`, never expires it.
2. `src/crypto/key-rotation/re-encrypt.ts:29-77` — `deriveChatKeyForChat`
   yields the new-key chat key; `decryptThenDecompress(msg.content, chatKey.key)`
   tries to decrypt old ciphertext with the new key → throws → silent skip.
   The in-code comment acknowledges: "This assumes the chat key derivation
   still works with the old actor key."
3. `src/crypto/actor-keys.ts` `loadActorKeys` loads **all** active keys per
   actor; after step 1 the actor has two active keys, compounding the IKMP drift.

## Impact

Running manual (`POST /api/admin/rotate-expired-keys`) or auto rotation makes
every prior encrypted message permanently undecryptable, silently.

## Acceptance Criteria

- [ ] Re-encrypt decrypts with the OLD chat key, re-encrypts with the NEW.
- [ ] Old key transitioned to `expired` only after re-encryption succeeds.
- [ ] Rotation preserves history (integration test with >0 messages).
- [ ] On partial failure, no history is silently skipped without surfacing.