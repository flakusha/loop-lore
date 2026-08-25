# BUG: rotateKeyOnLeave partial failure leaves mixed key state - non-transactional and swallowed

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Location: src/crypto/key-distribution.ts rotateKeyOnLeave; src/routes/chats/participants.ts:210-225.

Symptom: rotation sequence is (1) reEncryptWithKeys updates messages.content+key_id to the NEW key id per-message, then (2) UPDATE chat_keys SET id=newId. There is no transaction (054 migration docstring claims 'in one transaction' - it is not). If step 2 fails, or the route's catch fires after a partial step-1, some/all messages reference key_id=newId while the chat_keys row still has oldId -> reads throw 'Chat key not found for id ...' permanently. The DELETE-participant route catches ANY rotation error, logs warn ('non-fatal') and returns 204 - caller believes rotation succeeded.

Also: reEncryptWithKeys filters visibility='visible'; hidden/archived/deleted messages keep the OLD key_id which stops existing after the PK swap -> those rows become undecryptable even on success.

Fix: wrap re-encrypt + chat_keys swap in one Kysely transaction; on failure roll back and propagate (route should return 5xx, not 204+warn). Include non-visible messages in re-encryption (or explicitly document + null their key_id). Consider inserting the new chat_keys row first and deleting the old row inside the tx instead of PK-update-in-place.

Acceptance:
- [ ] forced failure mid-rotation leaves chat fully readable with OLD key
- [ ] hidden messages remain decryptable after leave
- [ ] route returns error status when rotation fails

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
