# BUG: auto key rotation derives chat keys from participant actor keys - legacy scheme incompatible with stable chat_keys

**Status:** ✅ Done (verified landed on dev — `rotateActorKey` performs atomic actor-key expiry with no message re-encrypt step, `messagesReEncrypted: 0`; covered by `rotate.test.ts`)
**Priority:** medium
**Effort:** Medium

## Summary

Location: src/crypto/key-rotation/rotate.ts rotateActorKeyAndReEncrypt; src/crypto/key-rotation/auto-run.ts runAutoRotation; wired in src/server/start.ts with encryption.keyRotationDays (default 90).

Symptom: the periodic rotation path decrypts messages with deriveChatKey(oldParticipantKeys, chatId) - the pre-054 HKDF-from-participant-keys scheme. Since migration 054 all message writes use stable per-chat random keys (deriveChatKeyForChat / getChatKeyById). Every auto-rotation cycle therefore fails AES-GCM auth on every message (failures logged, reEncrypted=0), rotates the actor key anyway (no effect on message crypto since chat keys no longer derive from actor keys), and burns a full history scan per chat per actor. Zero forward-secrecy benefit; log spam; misleading RotationResult.

Fix: align with the stable-key design: actor-key expiry should NOT attempt message re-encryption at all (chat keys are independent); either drop the re-encrypt step or gate it to chats that still carry pre-054 HKDF-encrypted rows (key_id referencing actor_keys ids). Note RE_ENCRYPT_LIMIT here defaults to 100 while rotateKeyOnLeave uses MAX_SAFE_INTEGER - unify.

Acceptance:
- [x] runAutoRotation on a standard-tier chat produces zero decryption failures
- [x] actor keys still expire/rotate on schedule
- [x] unit test asserting no re-encrypt attempts against chat_keys-keyed messages

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
