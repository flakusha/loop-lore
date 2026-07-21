# TASK: Epic 17 Expansion — E2E Encryption, Asset Encryption, Access Management

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Source:** User clarification, 2026-07-19
**Related:** docs/spec/encryption-workflow.md, docs/spec/crypto.md, docs/frontend/encryption.md

## Summary

Expand Epic 17 from "at-rest AES-256-GCM" to full e2e encryption scope: private chats, worlds, locations, asset encryption, and access management with key rotation when participants leave or lose access.

## Clarified Scope (from user)

> e2e encryption for private chats / worlds / locations / etc, asset encryption, proper access management (based on access time allowance - documented as keys rotation upon person leaving chat or losing access, same with assets)

## Current State

### What Exists (spec only, not implemented)

- `docs/spec/encryption-workflow.md` — 3-tier model (public/standard/private), key hierarchy, integrity verification
- `docs/spec/crypto.md` — encryption spec (actor keys, chat keys, BYOK, SMK)
- `docs/frontend/encryption.md` — frontend UX spec
- Messages stored as **plaintext** in DB

### What's Missing

- No encryption code in `src/`
- No key management system
- No access control for encrypted content
- No key rotation on participant leave
- No asset encryption

## Expanded Architecture

### Encryption Tiers

| Tier         | Scope                           | Encryption          | Key Management                 |
| ------------ | ------------------------------- | ------------------- | ------------------------------ |
| **Public**   | Public chats, world info        | None (plaintext)    | None                           |
| **Standard** | User's private chats            | AES-256-GCM at-rest | User key derived from password |
| **Private**  | Private chats with participants | E2E AES-256-GCM     | Shared keys, rotation on leave |

### Key Hierarchy

```
User Password
  ↓ Argon2id
User Master Key (UMK)
  ↓ HKDF
  ├── Chat Key (per chat)
  │   ↓ HKDF
  │   ├── Message Key (per message)
  │   └── Asset Key (per asset in chat)
  ├── World Key (per world)
  │   ↓ HKDF
  │   └── Location Key (per location)
  └── Actor Key (per character)
```

### Access Management

```
Participant Joins Chat
  ↓
Key Derivation:
  ├── Derive chat key from UMK
  ├── Share encrypted chat key with new participant
  └── Grant access to existing messages (re-encrypt or key wrap)

Participant Leaves Chat
  ↓
Key Rotation:
  ├── Generate new chat key
  ├── Re-encrypt all messages with new key
  ├── Re-encrypt all assets with new key
  ├── Distribute new key to remaining participants
  └── Old key becomes invalid (forward secrecy)

Access Revocation (time-based)
  ↓
  ├── Admin sets access time limit
  ├── After expiry: key becomes invalid
  ├── Messages remain encrypted (not deleted)
  └── Re-access requires new key grant
```

### Asset Encryption

```
Asset Upload
  ↓
  ├── Determine encryption tier from parent entity (chat/world/location)
  ├── Generate asset key (HKDF from parent key)
  ├── Encrypt asset with AES-256-GCM
  ├── Store encrypted blob + IV + auth tag
  └── Store key reference (encrypted with parent key)

Asset Download
  ↓
  ├── Verify access (participant check)
  ├── Derive asset key from parent key
  ├── Decrypt asset
  └── Return plaintext to authorized user
```

## Tasks

### Phase 1: Key Management Foundation

- [ ] Create `src/crypto/key-derivation.ts` — Argon2id, HKDF
- [ ] Create `src/crypto/key-store.ts` — key storage, retrieval
- [ ] Create `src/crypto/key-rotation.ts` — rotation logic
- [ ] Create `src/crypto/aes-gcm.ts` — encrypt/decrypt primitives
- [ ] Unit tests for all crypto operations

### Phase 2: Chat Encryption

- [ ] Add `encryption_tier` column to chats table
- [ ] Add `encrypted_key` column to chat_participants table
- [ ] Encrypt messages on storage (standard/private tier)
- [ ] Decrypt messages on retrieval (authorized participants only)
- [ ] Key derivation: user password → UMK → chat key

### Phase 3: World/Location Encryption

- [ ] Add `encryption_tier` column to worlds table
- [ ] Add `encryption_tier` column to locations table
- [ ] Encrypt world/location data
- [ ] Key derivation: UMK → world key → location key

### Phase 4: Asset Encryption

- [ ] Add `encryption_tier` column to assets table
- [ ] Encrypt asset blobs on upload
- [ ] Decrypt asset blobs on download (authorized only)
- [ ] Key derivation: parent key → asset key

### Phase 5: Access Management

- [ ] Participant join: key sharing (wrap chat key with new participant's UMK)
- [ ] Participant leave: key rotation (new chat key, re-encrypt, distribute)
- [ ] Time-based access: expiry check on key retrieval
- [ ] Admin access override: emergency key recovery

### Phase 6: Key Rotation

- [ ] Automatic rotation on participant leave
- [ ] Manual rotation (admin trigger)
- [ ] Re-encryption pipeline (batch messages + assets)
- [ ] Forward secrecy: old keys become invalid

### Phase 7: Frontend Integration

- [ ] Password-based key derivation (browser-side Argon2id)
- [ ] Key storage in browser (IndexedDB or similar)
- [ ] Encryption indicator in chat UI
- [ ] Key rotation notification
- [ ] Access expiry warning

## Files to Create

- `src/crypto/key-derivation.ts` — Argon2id, HKDF
- `src/crypto/key-store.ts` — key storage
- `src/crypto/key-rotation.ts` — rotation logic
- `src/crypto/aes-gcm.ts` — encrypt/decrypt
- `src/crypto/key-derivation.test.ts` — tests
- `src/crypto/aes-gcm.test.ts` — tests
- `src/db/migrations/` — encryption columns migration
- `src/routes/encryption.ts` — key management API

## Files to Modify

- `src/db/schema-chats.ts` — encryption_tier column
- `src/db/schema-worlds.ts` — encryption_tier column
- `src/db/schema-assets.ts` — encryption_tier column
- `src/routes/messages.ts` — encrypt on store, decrypt on retrieve
- `src/routes/assets.ts` — encrypt/decrypt assets
- `src/frontend/alpine/chat.ts` — encryption UI

## Risk

High — cryptographic implementation, key management complexity, performance impact of re-encryption, browser crypto API compatibility.

## Dependency

- Can start Phase 1 (crypto foundation) immediately
- Phase 2-4 depend on schema changes
- Phase 5-6 depend on chat/world encryption
- Phase 7 depends on all previous phases

## Open Questions

1. **Re-encryption performance:** Re-encrypting all messages on participant leave could be slow for large chats. Batch strategy?
2. **Browser crypto:** Argon2id in browser — WebAssembly or JS implementation?
3. **Key backup:** What if user loses password? Recovery mechanism?
4. **Admin access:** Should admins have emergency access to encrypted content?
5. **Migration:** How to handle existing plaintext messages?
