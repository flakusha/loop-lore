# BUG: carryHistory copies key_id into migrated chat - history breaks when source chat is deleted or rotated

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Location: src/chat/service/carry-history.ts carryHistory.

Symptom: chat migration copies messages.content AND messages.key_id verbatim into the new chat. key_id points at a chat_keys row owned by the SOURCE chat. Two breakage paths:
1. Source chat deleted -> chat_keys rows cascade-delete (chats.id ON DELETE CASCADE, migration 054) -> migrated chat's encrypted messages throw 'Chat key not found'.
2. Member leaves the SOURCE chat -> rotateKeyOnLeave re-encrypts only source-chat messages and REPLACES the chat_keys PK -> migrated copies still reference the old key id -> same error.

Fix: on carry, either (a) decrypt with source key + re-encrypt with the destination chat's own key (deriveChatKeyForChat(newChatId)) setting key_id to the new row, or (b) provision a fresh chat_keys row for the new chat and re-encrypt. Option (a) matches encryptMessageContent semantics.

Acceptance:
- [ ] migrate standard-tier chat with encrypted history -> delete source -> migrated history reads
- [ ] migrate -> member leaves source -> migrated history reads
- [ ] integration test covering both paths

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
