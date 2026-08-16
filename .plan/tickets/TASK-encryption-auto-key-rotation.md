<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Encryption — Auto-Key Rotation

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Med
**Epic:** epic-crypto
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-key-rotation (manual rotation done)

## Summary

Automatic key rotation based on `KEY_ROTATION_DAYS` config. Timer/cron-based check for expired keys, batch re-encrypt historical messages, notify participants.

## What Exists

- `src/crypto/actor-keys.ts` — `rotateActorKey()` (manual)
- `src/crypto/chat-keys.ts` — chat key derivation
- `src/routes/key-management.ts` — manual rotation endpoint
- `src/crypto/key-distribution.ts` — `rotateKeyOnLeave()`

## Design

```
KEY_ROTATION_DAYS=90 (config)
  ↓
Timer/cron checks actor_keys where:
  - status = 'active'
  - created_at < now() - KEY_ROTATION_DAYS
  ↓
For each expired key:
  1. Generate new actor key
  2. Derive new chat keys for affected chats
  3. Re-encrypt recent messages (async batch)
  4. Distribute new key to participants
  5. Mark old key as 'expired'
  6. Notify participants
```

## Tasks

- [x] Add `KEY_ROTATION_DAYS` to `src/config/schema.ts` (default: 90)
- [x] Add `key_rotated_at` column to `actor_keys` table
- [x] Create `src/crypto/key-rotation.ts`:
  - `findExpiredKeys(database, rotationDays)` — query expired keys
  - `rotateActorKey(database, actorId, smk)` — rotate single key
  - `reEncryptMessages(database, chatId, oldKeyId, newKey)` — batch re-encrypt
  - `notifyRotation(database, chatId, actorId)` — notify participants
- [x] Create rotation timer/cron in server startup
- [x] Add manual trigger: `POST /api/admin/rotate-expired-keys`
- [ ] Add tests: expiry detection, rotation, re-encryption, notification

## Files Created

- `src/crypto/key-rotation.ts` — rotation logic ✅

## Files Modified

- `src/config/schema.ts` — added `keyRotationDays` to EncryptionConfig ✅
- `src/config/sections/encryption.ts` — added keyRotationDays default ✅
- `src/server.ts` — rotation timer startup ✅
- `src/routes/admin.ts` — manual rotation endpoint ✅
- `src/crypto/index.ts` — exports for key-rotation ✅

## Risk

Med — async re-encryption performance, concurrent access during rotation, large message histories.

## Linked Epics

- `epic-crypto.md`
- `TASK-encryption-key-rotation.md` (manual rotation done)
