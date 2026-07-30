# EPIC: Encryption & Cryptographic Infrastructure

**Status:** 🟡 Partial
**Priority:** High
**Epic ID:** EPIC-2026-CRYPTO

## Summary

End-to-end encryption for chat messages, assets, and stored data. AES-256-GCM
encryption with key management, rotation, group key distribution, and
browser-side pre-encryption. Foundation for chat privacy and secure multi-user
scenarios.

## Scope

### Client-Side Pre-Encryption

- Browser encrypts before send (zero-knowledge server)
- WebCrypto API integration
- Key derivation from user passphrase

### Wire Message Pipeline

- Encrypt/decrypt in message send/receive pipeline
- Transparent to existing chat logic
- Metadata preserved (timestamps, sender) while content encrypted

### Key Management

- Key generation, storage, rotation UI
- Per-user and per-chat key sets
- Recovery key generation and backup

### Group Key Distribution

- Multi-party key agreement for group chats
- Key rotation on member join/leave
- Forward secrecy guarantees

### Access Management

- Role-based access to decryption keys
- Admin key escrow (optional, configurable)
- Audit log for key access

## Related Epics

- `epic-chat-lifecycle-moderation.md` — privacy and moderation coexistence
- `epic-chat-privacy.md` — privacy controls
- `epic-plugin-system.md` — encryption plugin hooks
- `epic-testing-benchmarking.md` — crypto performance benchmarks

## Integration Points

### Systems This Epic Depends On

| System          | What It Provides       | How Used                   |
| --------------- | ---------------------- | -------------------------- |
| Chat Lifecycle  | Message pipeline hooks | Encrypt/decrypt in transit |
| Auth Middleware | User identity          | Key ownership verification |

### Systems That Depend On This Epic

| System        | What It Consumes      | How Used                   |
| ------------- | --------------------- | -------------------------- |
| Chat Privacy  | Encryption primitives | Message confidentiality    |
| Asset System  | Asset encryption      | Encrypted media storage    |
| Plugin System | Crypto hooks          | Custom encryption backends |

## Tickets

- `FEAT-encryption-foundation-aes-256-gcm.md` — 🟨 Partial (core built)
- `TASK-client-side-encryption-aes-256-gcm.md` — ✅ Done
- `TASK-encryption-access-management.md` — ⬜ Not started
- `TASK-encryption-architecture-clarification.md` — ⬜ Not started
- `TASK-encryption-browser-pre-encrypt.md` — ⬜ Not started
- `TASK-encryption-group-key-distribution.md` — ✅ Done
- `TASK-encryption-key-management-ui.md` — 🟨 Partial (routes done, UI pending)
- `TASK-encryption-key-rotation.md` — 🟨 Partial (manual done, auto missing)
- `TASK-encryption-wire-message-pipeline.md` — ✅ Done
- `TASK-stable-stored-chat-key-future.md` — ⬜ Not started
- `TASK-encryption-auto-key-rotation.md` — ✅ Done
- `TASK-world-location-encryption.md` — ⬜ New
- `TASK-asymmetric-key-pairs.md` — ⬜ New
- `TASK-fix-crypto-isolation.md` — ✅ Done (was misdiagnosed)
