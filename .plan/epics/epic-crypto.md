<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Encryption & Cryptographic Infrastructure

**Status:** 🟡 Partial
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** encryption, aes-256-gcm, key-management, e2ee, browser-crypto
**Epic ID:** EPIC-2026-CRYPTO

## Summary

End-to-end encryption for chat messages, assets, and stored data. AES-256-GCM
encryption with key management, rotation, group key distribution, and
browser-side pre-encryption. Foundation for chat privacy and secure multi-user
scenarios.

## Algorithm Extensibility

The encryption system MUST support future additions of new algorithms without modifying core crypto code. This is achieved through:

- **Algorithm Registry**: A central registry that maps algorithm identifiers to implementations
- **Factory Pattern**: `createEncryptor(algorithm)` and `createDecryptor(algorithm)` factories that return algorithm-specific implementations
- **Plugin Hooks**: Crypto hooks in the plugin system allow registering new algorithms at runtime
- **Configuration-Driven**: Algorithm selection is driven by config, not hardcoded values
- **Backward Compatible**: Existing AES-256-GCM and compression algorithms remain the default

### Design

```typescript
// Algorithm registry - plugins register here
interface CryptoAlgorithm {
  id: string; // e.g., "aes-256-gcm", "chacha20-poly1305"
  type: "encryption" | "compression" | "key-derivation";
  encrypt: (data: Uint8Array, key: CryptoKey, opts?: Record<string, unknown>,) => Promise<Uint8Array>;
  decrypt: (data: Uint8Array, key: CryptoKey, opts?: Record<string, unknown>,) => Promise<Uint8Array>;
  keyLength: number;
  nonceLength: number;
}

interface AlgorithmFactory {
  register(algorithm: CryptoAlgorithm,): void;
  getAlgorithm(id: string,): CryptoAlgorithm | undefined;
  listAlgorithms(type?: "encryption" | "compression" | "key-derivation",): CryptoAlgorithm[];
  createEncryptor(algorithmId: string, key: CryptoKey,): Encryptor;
  createDecryptor(algorithmId: string, key: CryptoKey,): Decryptor;
}
```

### Requirements

1. **Registry API**: `registerAlgorithm()`, `getAlgorithm()`, `listAlgorithms()`
2. **Factory API**: `createEncryptor()`, `createDecryptor()` with algorithm ID
3. **Plugin Hook**: `onCryptoAlgorithmRegister` hook for runtime registration
4. **Config Support**: `encryption.algorithm` and `compression.algorithm` config fields
5. **Fallback**: Graceful fallback to default algorithm if requested algorithm not found
6. **Validation**: Algorithm validation on registration (key sizes, nonce sizes, etc.)

### Scope

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
- `TASK-non-standard-browser-crypto-research.md` — ⬜ Research: JS/WASM crypto beyond WebCrypto

### Algorithm Extensibility (New)

- `TASK-crypto-algorithm-factory.md` — ⬜ Not started
- `TASK-crypto-plugin-hooks.md` — ⬜ Not started
- `TASK-crypto-config-algorithm.md` — ⬜ Not started
- `TASK-encryption-asset-encryption-update.md` — ⬜ Not started
- `TASK-encryption-backward-compatibility.md` — ⬜ Not started
- `TASK-crypto-algorithm-tests.md` — ⬜ Not started

## Related Epics (Extended)

- `epic-non-standard-browser-crypto.md` — JS/WASM crypto libs, ChaCha20, Argon2, post-quantum readiness
