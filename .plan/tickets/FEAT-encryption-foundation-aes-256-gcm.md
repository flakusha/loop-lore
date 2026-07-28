# FEAT: Encryption Foundation (AES-256-GCM)

**Status:** 🟨 Partial (core built, wiring pending)
**Priority:** medium
**Effort:** Large
**Epic:** epic-encryption-foundation

## Summary

AES-256-GCM encryption, per-user keys, browser-side key derivation. Privacy-first stance (from moderation decision). After user-facing wiring complete. Blocks Epic 17.

## What's Built

- `src/crypto/` — full crypto module (SMK, actor-keys, chat-keys, pipeline, at-rest, key-distribution, user-keys, e2e, byok)
- `src/routes/messages.ts` — encrypt on write, decrypt on read
- `src/routes/key-management.ts` — key CRUD
- `src/frontend/browser.ts` — client-side encrypt/decrypt

## Remaining

- Key management UI (Alpine.js component)
- Browser pre-encrypt integration into chat UI
- Auto-key rotation
- Asset encryption
- Crypto test isolation fix

## Acceptance Criteria

- [x] Core crypto module complete
- [x] Message route integration complete
- [x] Key management routes complete
- [ ] Key management UI
- [ ] Browser pre-encrypt integration
- [ ] Auto-key rotation
- [ ] Tests passing in full suite (currently ~20 failures)
