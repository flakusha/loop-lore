# BUG: chat key lazy-create race violates chat_id unique constraint on concurrent first messages

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

Location: src/crypto/chat-keys.ts deriveChatKeyForChat; migration 054 (UNIQUE index idx_chat_keys_chat_id).

Symptom: two concurrent first-message writes to a fresh standard-tier chat both SELECT (empty), both generate random keys, both INSERT. Loser hits SQLITE_CONSTRAINT_UNIQUE -> 500 on message send. No ON CONFLICT handling or retry anywhere in the path (encryptAtRest -> deriveChatKeyForChat).

Fix: INSERT ... ON CONFLICT(chat_id) DO NOTHING, then re-SELECT the winning row and import that key; or catch unique-violation and retry the select once. Keep single-flight semantics per chat.

Acceptance:
- [ ] concurrency test: N parallel encryptMessageContent calls on a fresh chat all succeed with the SAME keyId
- [ ] no behavior change for the sequential path

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
