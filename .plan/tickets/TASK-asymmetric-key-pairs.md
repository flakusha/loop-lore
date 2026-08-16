<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Encryption — Asymmetric Key Pairs (True E2E)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Large
**Epic:** epic-crypto
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-architecture-clarification

## Summary

Public/private key pair generation for true end-to-end encryption in private tier chats. Server never sees plaintext — clients encrypt/decrypt locally.

## What Exists

- `src/crypto/e2e/key-bundle.ts` — symmetric key wrapping (server-mediated)
- `src/frontend/browser.ts` — browser-side encrypt/decrypt
- `docs/frontend/encryption.md` — private tier spec

## Design

```
Per-User Key Pair:
  - Generate ECDSA P-256 or X25519 key pair
  - Public key: stored in actor_keys, distributed to others
  - Private key: stored in user's device (IndexedDB), never sent to server

Key Exchange (Private Tier):
  1. User A encrypts message with random AES key
  2. Encrypts AES key with User B's public key
  3. Sends encrypted key bundle to server
  4. Server stores bundle (cannot decrypt)
  5. User B decrypts AES key with private key
  6. User B decrypts message with AES key

Forward Secrecy:
  - New key pair per session or per N messages
  - Old private keys deleted after rotation
  - Historical messages re-encrypted with new key
```

## Tasks

- [ ] Design asymmetric key protocol (ECDSA vs X25519)
- [ ] Add `key_type` enum to `actor_keys`: 'symmetric' | 'asymmetric'
- [ ] Add `public_key` column to `actor_keys` table
- [ ] Implement key pair generation in `src/crypto/e2e/key-pairs.ts`
- [ ] Implement asymmetric key exchange in `src/crypto/e2e/key-exchange.ts`
- [ ] Extend `key-bundle.ts` to support asymmetric wrapping
- [ ] Browser-side: generate key pair, store private key in IndexedDB
- [ ] Browser-side: encrypt/decrypt with asymmetric keys
- [ ] Key distribution: distribute public keys to chat participants
- [ ] Forward secrecy: rotate key pairs, re-encrypt historical messages
- [ ] Add tests: key generation, exchange, encrypt/decrypt, forward secrecy

## Files to Create

- `src/crypto/e2e/key-pairs.ts` — asymmetric key pair generation
- `src/crypto/e2e/key-exchange.ts` — asymmetric key exchange protocol
- `src/crypto/e2e/key-pairs.test.ts` — tests

## Files to Modify

- `src/db/schema-core.ts` — add key_type, public_key columns
- `src/db/migrations/` — migration
- `src/crypto/e2e/key-bundle.ts` — support asymmetric wrapping
- `src/frontend/browser.ts` — asymmetric encrypt/decrypt
- `src/routes/key-management.ts` — asymmetric key endpoints

## Risk

High — cryptographic protocol design, forward secrecy, browser compatibility, performance.

## Linked Epics

- `epic-crypto.md`
- `TASK-encryption-architecture-clarification.md`
- `TASK-epic17-encryption-e2e-expansion.md`
