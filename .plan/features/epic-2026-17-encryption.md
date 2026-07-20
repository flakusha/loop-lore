# Epic 2026-17: Encryption Foundation

**Status:** ⬜ Not Started (P1)
**Priority:** High
**Source:** docs/meta/backlog.md, user clarification 2026-07-20

## Summary

E2E encryption for private chats/worlds/locations, asset encryption, access management, key rotation. Two models: symmetric (local/public chats) and asymmetric (e2e/private chats).

## Encryption Models

### Symmetric (Local/Public Chats)
- Shared key per chat
- Key exchange endpoint between users
- DB stores encrypted (AES-256-GCM)
- Admin CANNOT access (zero-knowledge)
- Explicit sharing required upon invite
- Key rotation on message periods

### Asymmetric (E2E/Private Chats)
- Public/private key pairs per user
- Only access is required (not privacy)
- Admin manages access (not content)
- Grant/revoke access model
- Use case: private DMs, sensitive content

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| TASK-encryption-architecture-clarification.md | Symmetric vs asymmetric architecture | High | Not Started |
| TASK-encryption-wire-message-pipeline.md | Wire message pipeline (encrypt/decrypt on write/read) | High | Not Started |
| TASK-encryption-key-management-ui.md | Key management UI (view/generate/rotate/revoke) | High | Not Started |
| TASK-encryption-group-key-distribution.md | Group key distribution (join/leave key handling) | High | Not Started |
| TASK-encryption-key-rotation.md | Key rotation (auto + manual, re-encrypt history) | Medium | Not Started |
| TASK-encryption-asset-encryption.md | Asset encryption (encrypt blobs, tier inheritance) | Medium | Not Started |
| TASK-encryption-access-management.md | Access management (time-based expiry, admin grants) | Medium | Not Started |
| TASK-encryption-browser-pre-encrypt.md | Browser pre-encrypt (fallbacks, platform, CSP) | Medium | Not Started |

## Implementation Phases

### Phase 1: Crypto Foundation (exists)
- [x] SMK (Server Master Key) — `src/crypto/smk.ts`
- [x] Actor keys — `src/crypto/actor-keys.ts`
- [x] Chat keys — `src/crypto/chat-keys.ts`
- [x] Compress-encrypt pipeline — `src/crypto/pipeline.ts`
- [x] BYOK (API key encryption) — `src/crypto/byok.ts`
- [x] 69 unit tests passing

### Phase 2: Message Pipeline
- [ ] Wire encrypt/decrypt into message routes
- [ ] Encryption tier column (public/standard/private)
- [ ] Fallback handling (missing key, unavailable crypto)

### Phase 3: Key Management
- [ ] Key management UI (/settings/keys)
- [ ] Group key distribution (join/leave)
- [ ] Key rotation (auto + manual)
- [ ] Access management (time-based expiry)

### Phase 4: Asset & E2E
- [ ] Asset encryption (blobs, tier inheritance)
- [ ] Browser pre-encrypt (Web Crypto API)
- [ ] Fallbacks (HTTP, old browsers, mobile)
- [ ] CSP compliance (bundle, no node_modules serving)

## Files

- `src/crypto/at-rest.ts` — At-rest encryption
- `src/crypto/user-keys.ts` — Per-user keys
- `src/crypto/chat-keys.ts` — Chat keys
- `src/crypto/pipeline.ts` — Encryption pipeline
- `src/routes/messages.ts` — Encrypted storage
- `src/assets/controller.ts` — Signed URLs
- `src/frontend/browser.ts` — Browser key derivation
