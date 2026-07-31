# EPIC: Encryption Workflow

**Status:** 🟡 Core Built, Integration Pending
**Priority:** Medium
**Spec:** `docs/spec/encryption-workflow.md`

## Summary

Full encryption lifecycle: compress→encrypt→decrypt→decompress pipeline, tier-aware storage, key management, and distribution. Core pipeline and routes built; remaining work is auto-rotation, asset encryption, and UI.

## What's Built

- `src/crypto/pipeline.ts` — `compressThenEncrypt` / `decryptThenDecompress` (now supports extensible algorithms)
- `src/crypto/at-rest.ts` — tier-aware encrypt/decrypt wrapper
- `src/crypto/smk.ts` — SMK initialization
- `src/crypto/actor-keys.ts` — actor key CRUD
- `src/crypto/chat-keys.ts` — chat key derivation
- `src/crypto/key-distribution.ts` — join/leave key distribution
- `src/crypto/user-keys.ts` — user key management
- `src/crypto/e2e/key-bundle.ts` — symmetric key wrapping
- `src/crypto/byok.ts` — API key encryption
- `src/routes/messages.ts` — encrypt on write, decrypt on read
- `src/routes/key-management.ts` — key CRUD endpoints
- `src/routes/message-encryption.ts` — chat key endpoint
- `src/routes/auth.ts` — actor key creation on login

## Algorithm Extensibility

The encryption workflow now supports future additions of new algorithms through:

- **Algorithm Registry**: Central registry for algorithm implementations
- **Factory Pattern**: `createEncryptor(algorithm)` and `createDecryptor(algorithm)` 
- **Configuration-Driven**: Algorithm selection via config
- **Plugin Hooks**: Runtime algorithm registration via plugins

## Remaining Tasks

### Phase 2a: Auto-Key Rotation

- [ ] `KEY_ROTATION_DAYS` config option
- [ ] `src/crypto/key-rotation.ts` — standalone rotation module
- [ ] Timer/cron-based auto-rotation trigger
- [ ] Batch re-encryption pipeline for historical messages
- [ ] Rotation notification to participants

### Phase 2b: Asset Encryption

- [ ] Wire `encryptAtRest`/`decryptAtRest` into `src/assets/service.ts`
- [ ] Add `encryption_tier` + `encrypted_key_id` columns to `assets` table
- [ ] Key derivation: parent key → asset key (HKDF)
- [ ] Tests: encrypt on upload, decrypt on download

### Phase 2c: Key Management UI

- [ ] `src/frontend/alpine/key-management.ts` — Alpine.js component
- [ ] `src/components/settings/key-management.html` — UI template
- [ ] Wire into `/settings/keys` page
- [ ] Re-auth gate for sensitive operations

### Phase 2d: Algorithm Extensibility

- [ ] `TASK-crypto-algorithm-factory.md` — implement algorithm factory
- [ ] `TASK-crypto-plugin-hooks.md` — add crypto plugin hooks
- [ ] `TASK-crypto-config-algorithm.md` — add algorithm configuration
- [ ] `TASK-encryption-asset-encryption-update.md` — update asset encryption for extensible algorithms
- [ ] `TASK-encryption-backward-compatibility.md` — implement backward compatibility
- [ ] `TASK-crypto-algorithm-tests.md` — create comprehensive tests

### Phase 3: Time-Based Access

- [ ] `access_duration_days` column on `chats`
- [ ] `expires_at` / `revoked_at` columns on `chat_participants`
- [ ] Expiry check on key retrieval
- [ ] Admin endpoint: grant/revoke/extend access

### Phase 4: Advanced Encryption

- [ ] World/Location encryption (schema + key derivation chain)
- [ ] Asymmetric key pairs for true E2E
- [ ] Browser pre-encrypt integration (feature detection + fallbacks)
- [ ] Anonymous chat mode

## Related Epics

- `epic-crypto.md` — parent encryption epic
- `epic-frontend-encryption.md` — frontend encryption UI
- `epic-chat-lifecycle-moderation.md` — privacy/moderation coexistence

## Related Tickets

- `TASK-epic17-encryption-e2e-expansion.md` — detailed status tracker
- `TASK-encryption-wire-message-pipeline.md` — ✅ DONE
- `TASK-encryption-group-key-distribution.md` — ✅ DONE
- `TASK-encryption-key-management-ui.md` — routes done, UI pending
- `TASK-encryption-key-rotation.md` — manual done, auto missing
- `TASK-encryption-asset-encryption.md` — ⬜ Not started
- `TASK-encryption-access-management.md` — ⬜ Not started
- `TASK-encryption-browser-pre-encrypt.md` — ⬜ Not started
- `TASK-fix-crypto-isolation.md` — ~20 test failures in full suite
