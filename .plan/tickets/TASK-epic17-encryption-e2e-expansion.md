# TASK-epic17-encryption-e2e-expansion

## Epic: Encryption E2E Expansion (Epic 17)

## Status: 🟨 Partially Implemented

## Summary

End-to-end encryption for chat messages, assets, and player state. This epic covers the full encryption lifecycle: key derivation, key distribution, message encryption/decryption, key rotation, and access management.

## Current State (Updated)

### Already Implemented

- **`src/crypto/pipeline.ts`** — `compressThenEncrypt` / `decryptThenDecompress` pipeline (DONE, wired into `routes/messages.ts`)
- **`src/crypto/at-rest.ts`** — `encryptAtRest` / `decryptAtRest` / `needsEncryption` / `getChatEncryptionLevel` (DONE)
- **`src/crypto/chat-keys.ts`** — `deriveChatKey`, `deriveChatKeyForChat`, `getChatParticipantActorIds` (DONE, tested)
- **`src/crypto/actor-keys.ts`** — `generateActorKey`, `ensureActorKey`, `loadActorKeys`, `getActorKey`, `rotateActorKey`, `revokeActorKey`, `listActorKeys` (DONE, tested)
- **`src/crypto/smk.ts`** — `initSmk`, `getSmk`, `isEncryptionEnabled` (DONE, tested)
- **`src/crypto/key-distribution.ts`** — `getChatKey`, `distributeKeysOnJoin`, `rotateKeyOnLeave`, `resolveChatKey` (DONE)
- **`src/crypto/user-keys.ts`** — `verifyPassphrase`, `storeUserKey`, `deriveUserKey`, `revokeUserKey`, `hasUserKey` (DONE)
- **`src/crypto/byok.ts`** — `encryptValue`, `decryptValue` (DONE, tested)
- **`src/crypto/e2e/key-bundle.ts`** — `encryptChatKeyForUser`, `decryptChatKeyFromBundle`, `storeKeyBundle`, `loadKeyBundle`, `removeKeyBundles`, `listBundleUsers` (DONE)

### Routes Wired

- `routes/messages.ts` — encrypts on store, decrypts on retrieve (compressThenEncrypt/decryptThenDecompress)
- `routes/chats.ts` — `distributeKeysOnJoin` on participant add, `rotateKeyOnLeave` on participant remove
- `routes/key-management.ts` — full CRUD: list keys, generate, rotate, revoke
- `routes/message-encryption.ts` — GET endpoint for chat encryption key
- `routes/auth.ts` — `ensureActorKey` on login
- `routes/api-keys.ts` — encrypts API keys via `byok.ts`

### Schema

- `encryption_level` column on `chats` table (migration 024)

### Genuinely Missing

1. **Standalone `key-rotation.ts` module** — rotation logic is split between `key-distribution.ts` (rotateKeyOnLeave) and `actor-keys.ts` (rotateActorKey), but no timer/cron-based auto-rotation, no `KEY_ROTATION_DAYS` config, no batch re-encryption pipeline
2. **Asset encryption** — ticket exists but nothing wired in asset routes
3. **Time-based access expiry** — ticket exists but no expiry columns, no expiry check logic
4. **World/Location encryption** — no schema columns, no key derivation chain for worlds→locations
5. **Asymmetric key pairs** — `e2e/key-bundle.ts` only handles symmetric key wrapping; no public/private key pair generation

## Phases

### Phase 1: Key Management System

- [x] `src/crypto/user-keys.ts` — passphrase verification, user key storage
- [x] `src/crypto/actor-keys.ts` — actor key lifecycle (generate, rotate, revoke)
- [x] `src/crypto/smk.ts` — system master key initialization
- [x] `src/crypto/key-distribution.ts` — chat key distribution on join/leave
- [ ] `src/crypto/key-rotation.ts` — **NEW**: standalone auto-rotation module with timer/cron
- [ ] `KEY_ROTATION_DAYS` config option
- [ ] Batch re-encryption pipeline for rotated keys

### Phase 2: Message Encryption

- [x] `src/crypto/pipeline.ts` — compressThenEncrypt/decryptThenDecompress
- [x] `routes/messages.ts` — encrypt on store, decrypt on retrieve
- [x] `routes/key-management.ts` — full CRUD endpoints
- [x] `routes/message-encryption.ts` — GET chat key endpoint

### Phase 3: Asset & World Encryption

- [ ] Asset encryption in asset routes (not wired)
- [ ] World/Location encryption schema columns (not added)
- [ ] Key derivation chain: world key → location key → chat key (not implemented)
- [ ] Time-based access expiry columns and logic (not implemented)

### Phase 4: Asymmetric Key Pairs

- [ ] Public/private key pair generation in `e2e/`
- [ ] Extend `e2e/key-bundle.ts` to support asymmetric wrapping
- [ ] Asymmetric key exchange protocol

## Related Tickets

- TASK-encryption-wire-message-pipeline.md — ✅ DONE
- TASK-encryption-asset-encryption.md — ⬜ TODO
- TASK-encryption-group-key-distribution.md — ✅ DONE
- TASK-encryption-key-rotation.md — 🟨 PARTIAL (manual done, auto missing)
- TASK-encryption-access-management.md — ⬜ TODO
- TASK-encryption-browser-pre-encrypt.md — ⬜ TODO
- TASK-encryption-key-management-ui.md — 🟨 PARTIAL (routes done, UI pending)
- TASK-client-side-encryption-aes-256-gcm.md — ✅ DONE
- TASK-fix-crypto-isolation.md — ⬜ TODO (~20 test failures)
- TASK-stable-stored-chat-key-future.md — ⬜ TODO (low priority)
- TASK-encryption-architecture-clarification.md — ⬜ TODO (design phase)
- TASK-encryption-auto-key-rotation.md — ⬜ NEW
- TASK-world-location-encryption.md — ⬜ NEW
- TASK-asymmetric-key-pairs.md — ⬜ NEW

## Related Epics

- epic-crypto.md
- epic-encryption-workflow.md
- epic-frontend-encryption.md
- epic-byok-api-keys.md
