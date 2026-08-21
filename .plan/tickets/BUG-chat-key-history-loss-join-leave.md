<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Group-chat history becomes undecryptable after any participant join/leave

**Status:** 🟢 Closed — fixed by crypto-chat-history-survives-membership branch (commits 8400433a + 8e75ae1f)
**Severity:** Critical
**Priority:** High
**Epic:** epic-crypto
**Related:** TASK-encryption-group-key-distribution, TASK-stable-stored-chat-key-future

## Summary

The chat key is `HKDF-SHA256(salt=chatId, IKM=concat(sorted participant actor
rawKeys))` (`src/crypto/chat-keys.ts:52-92`), so it changes whenever the
participant set changes. Join (`distributeKeysOnJoin`) and leave
(`rotateKeyOnLeave`) re-derive the key but do **not** re-encrypt existing
messages. The read path always derives the **current** key and never consults
`messages.key_id`. Result: after any membership change, every prior message
fails GCM auth-tag verification and is surfaced as
`[Encrypted — unable to decrypt]`.

## Root Causes

1. `src/crypto/chat-keys.ts:52-92` — key derived from the full participant set.
2. `src/crypto/key-distribution.ts:70-149` — join/leave re-derive, no re-encrypt.
3. `src/routes/messages/helpers.ts:136-159` + `src/crypto/message-content.ts`
   `decryptMessageContent` — decrypt with `deriveChatKeyForChat` (current key),
   ignore the stored `key_id`.
4. `src/routes/messages/read.ts` — decrypt failure collapses to a placeholder,
   hiding the data loss from the user.

## Also

- `messages.key_id` stores `participantKeys[0].keyId` (the first participant's
  *actor* key id, not a chat key id) and is never consulted. It is dead,
  misleading metadata.

## Impact

Irreversible history loss on the common operations of inviting or removing a
participant. Affects all encrypted chats (the default path when SMK is set),
not just `standard`-tier — because key derivation is participant-set-dependent
independent of the tier-gated `distributeKeysOnJoin`/`rotateKeyOnLeave` calls.

- [x] Chat history survives participant join/leave (stable stored key in `chat_keys` table).
- [x] Read path uses stored `key_id` → `chat_keys` lookup to find the correct key.
- [x] Integration test: add/remove participant after N messages → all N still decrypt.