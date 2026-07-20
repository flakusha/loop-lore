# TASK: Encryption — Asset Encryption

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-wire-message-pipeline

## Summary

Encrypt asset blobs (images, audio, video) when stored in standard/private tier chats. Assets inherit the parent entity's encryption tier.

## What Exists

- `src/assets/service.ts` — asset CRUD
- `src/assets/controller.ts` — asset routes
- `src/crypto/pipeline.ts` — compress-then-encrypt (reuse for assets)

## Design

```
Asset Upload
  ↓
  ├── Determine tier from parent (chat/world/location)
  ├── If tier ≠ public:
  │   ├── Derive asset key (HKDF from parent key)
  │   ├── Encrypt blob with AES-256-GCM
  │   └── Store: encrypted_blob + IV + auth_tag
  └── If tier = public:
      └── Store plaintext (current behavior)

Asset Download
  ↓
  ├── Check access (participant check)
  ├── If encrypted:
  │   ├── Derive asset key
  │   └── Decrypt blob
  └── Return plaintext to authorized user
```

## Tasks

- [ ] Add `encryption_tier` column to `assets` table
- [ ] Add `encrypted_key_id` column to `assets` table
- [ ] On upload: if tier ≠ public, encrypt blob before storage
- [ ] On download: if encrypted, decrypt blob before serving
- [ ] Key derivation: parent key → asset key (HKDF)
- [ ] Add tests: encrypt on upload, decrypt on download, tier inheritance

## Files to Modify

- `src/db/schema-assets.ts` — add encryption columns
- `src/db/migrations/` — migration
- `src/assets/service.ts` — encrypt/decrypt blobs
- `src/assets/controller.ts` — wire encryption

## Risk

Low–Med — pipeline exists, just needs wiring to assets. Large file encryption performance.
