# TASK: Encryption — Group Key Distribution

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Med
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

- [ ] Add `wrapped_key` column to `chat_participants` table
- [ ] On participant join: wrap chat key with new participant's actor key
- [ ] On participant leave: generate new chat key
- [ ] On participant leave: re-encrypt recent messages (last N or configurable)
- [ ] On participant leave: distribute new key to remaining participants
- [ ] Add tests: join gets key, leave revokes access, rotation works

## Files to Modify

- `src/db/schema-chats.ts` — add `wrapped_key` column
- `src/db/migrations/` — migration
- `src/crypto/chat-keys.ts` — key wrapping/unwrapping
- `src/routes/chats.ts` — wire into participant add/remove

## Risk

Med — re-encryption performance on leave, concurrent access during rotation.
