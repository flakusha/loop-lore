<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Encryption — Group Key Distribution

**Status:** ✅ Done
**Priority:** High
**Effort:** Med
**Epic:** epic-crypto
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-wire-message-pipeline

## Summary

Handle key distribution when participants join/leave encrypted chats. New participants receive the chat key; departing participants' access is revoked via key rotation.

## What Exists

- `src/crypto/chat-keys.ts` — `deriveChatKeyForChat(db, chatId, smk)`
- `src/crypto/actor-keys.ts` — actor key management
- Chat participant table: `chat_participants`

## Scenarios

| Event                            | Action                                                  |
| -------------------------------- | ------------------------------------------------------- |
| Participant joins standard chat  | Wrap chat key with new participant's actor key          |
| Participant joins private chat   | Same — wrap chat key                                    |
| Participant leaves standard chat | Rotate chat key, re-encrypt with remaining participants |
| Participant leaves private chat  | Same — rotate + re-encrypt                              |
| New message after rotation       | Encrypted with new key only                             |

## Tasks

- [x] `src/crypto/key-distribution.ts` — `distributeKeysOnJoin` + `rotateKeyOnLeave`
- [x] `src/crypto/e2e/key-bundle.ts` — symmetric key wrapping for bundles
- [x] Wire into `src/routes/chats.ts` — distribute on participant add, rotate on remove
- [ ] Add `wrapped_key` column to `chat_participants` table (for per-participant wrapped keys)
- [ ] On participant leave: re-encrypt recent messages (last N or configurable)
- [ ] Add tests: join gets key, leave revokes access, rotation works

## Files to Modify

- `src/db/schema-chats.ts` — add `wrapped_key` column
- `src/db/migrations/` — migration
- `src/crypto/chat-keys.ts` — key wrapping/unwrapping
- `src/routes/chats.ts` — wire into participant add/remove

## Risk

Med — re-encryption performance on leave, concurrent access during rotation.

## Linked Epics

- `epic-crypto.md`

## Known Issue

Join/leave re-derive the chat key but do not re-encrypt history, so all prior
messages become undecryptable after a membership change. The "re-encrypt recent
messages" task above is therefore CRITICAL, not optional. See
`BUG-chat-key-history-loss-join-leave.md`.
