<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Non-Standard Browser Encryption

**Status:** 🟦 Research
**Priority:** Medium
**Effort:** High
**Type:** Research + Feature Epic
**Tags:** encryption, wasm, js-crypto, chacha20, argon2, libsodium, browser-crypto, post-aes
**Epic ID:** EPIC-2026-NON-STANDARD-CRYPTO

## Summary

Research and implement non-standard browser encryption beyond WebCrypto API.
Current client-side crypto (`src/frontend/browser-crypto.ts`) uses only
`crypto.subtle.encrypt/decrypt` (AES-256-GCM). This epic explores JS and
WASM-compiled alternatives for stronger algorithms, better key derivation,
and post-quantum readiness.

## Motivation

WebCrypto API is limited to browser-exposed algorithms:

- **AES-GCM, AES-CBC** — symmetric
- **RSA-OAEP** — asymmetric
- **PBKDF2, HKDF** — key derivation

Missing from WebCrypto:

- **ChaCha20-Poly1305** — faster on mobile, no hardware AES acceleration
- **XChaCha20-Poly1305** — 192-bit nonce (safe for random nonces)
- **Argon2id** — memory-hard KDF (resistant to GPU/ASIC attacks)
- **Blake3** — fast hashing for key derivation
- **Post-quantum** — Kyber, Dilithium (future-proofing)

## Scope

### Research Phase (This Epic's Focus)

- JS crypto library evaluation (libsodium.js, TweetNaCl.js, SJCL)
- WASM crypto evaluation (libsodium WASM, Rust-wasm, Go-wasm)
- Algorithm comparison and selection
- Performance benchmarks in browser
- CSP and bundle size impact
- Integration path with existing `browser-crypto.ts`
- **Data consistency hashing** — mandatory integrity verification for encrypted payloads

### Data Consistency: Hashing Requirements

**Problem**: Encrypted data in DB has no integrity guarantee beyond AES-GCM auth tag.
If storage corrupts ciphertext (bit flip, partial write, backup restore error),
the auth tag may not catch it (e.g., key rotation, re-encryption, migration).

**Mandatory hashing for**:

1. **Asset confirmation & validation**
   - Hash asset blob on upload (before encryption)
   - Store `content_hash` alongside encrypted asset
   - Verify hash on download (after decryption)
   - Detect: storage corruption, backup restore errors, migration bugs
   - Algorithm: BLAKE3 (fast, parallel) or SHA-256 (widely supported)

2. **Encrypted message hashing in DB**
   - Hash encrypted payload before DB write
   - Store `payload_hash` on message row
   - Verify on read (before decryption)
   - Detect: DB corruption, partial writes, concurrent clobber
   - Algorithm: BLAKE3 or SHA-256 (consistent with asset hashing)

3. **Key integrity**
   - Hash wrapped keys before storage
   - Verify on unwrap
   - Detect: key table corruption, backup restore errors

**Design**:

```
Upload flow:
  plaintext → hash(plaintext) → encrypt → hash(encrypted) → store
                                                          ↓
                                              content_hash + payload_hash

Download flow:
  load → verify payload_hash → decrypt → verify content_hash → plaintext
```

**Schema additions**:

```sql
-- Assets
ALTER TABLE assets ADD COLUMN content_hash TEXT;    -- hash of plaintext blob
ALTER TABLE assets ADD COLUMN payload_hash TEXT;    -- hash of encrypted payload

-- Messages (encrypted tier)
ALTER TABLE messages ADD COLUMN payload_hash TEXT;  -- hash of encrypted content JSON

-- Keys
ALTER TABLE actor_keys ADD COLUMN key_hash TEXT;    -- hash of wrapped key
```

### Implementation Phase (Future)

- Selected library/WASM integration
- Algorithm upgrade path (ChaCha20-Poly1305 default)
- Argon2id key derivation in browser
- Fallback chain: WASM → JS → WebCrypto
- Performance optimization (Web Workers for heavy ops)

## Current State

| Component               | Status     | Notes                            |
| ----------------------- | ---------- | -------------------------------- |
| AES-256-GCM (WebCrypto) | ✅ Built   | `src/frontend/browser-crypto.ts` |
| Compress-then-encrypt   | ✅ Built   | `src/frontend/browser.ts`        |
| Key import/export       | ✅ Built   | WebCrypto raw key format         |
| PBKDF2 key derivation   | ❌ Missing | Only server-side currently       |
| ChaCha20-Poly1305       | ❌ Missing | Not in WebCrypto                 |
| Argon2id (browser)      | ❌ Missing | Requires WASM or JS impl         |
| WASM crypto loading     | ❌ Missing | No WASM infrastructure yet       |
| JS crypto fallback      | ❌ Missing | No pure-JS crypto libs bundled   |

## Research Questions

1. **Library selection**: libsodium.js vs TweetNaCl.js vs SJCL vs hand-rolled?
2. **WASM vs JS**: Performance delta? Bundle size tradeoff? CSP implications?
3. **Algorithm choice**: ChaCha20-Poly1305 default? XChaCha20 for random nonces?
4. **Key derivation**: Argon2id in browser (WASM) vs PBKDF2 (WebCrypto)?
5. **Fallback strategy**: WASM → JS → WebCrypto chain design?
6. **Post-quantum**: When to start evaluating Kyber/Dilithium?
7. **Bundle impact**: How much does libsodium WASM add to bundle?
8. **Worker strategy**: Offload heavy ops to Web Workers?

## Related Epics

- `epic-crypto.md` — parent encryption epic (AES-256-GCM foundation)
- `epic-frontend-encryption.md` — frontend encryption UI
- `epic-encryption-workflow.md` — encryption pipeline
- `epic-byok-local-models.md` — WASM infrastructure (parallel work)

## Integration Points

### Systems This Epic Depends On

| System            | What It Provides      | How Used                     |
| ----------------- | --------------------- | ---------------------------- |
| browser-crypto.ts | Current AES-GCM impl  | Replace/extend with new algs |
| browser.ts        | Compress-encrypt pipe | Upgrade payload format       |
| CSP policy        | Security constraints  | WASM loading rules           |
| Build system      | Bundle config         | Include WASM/JS crypto libs  |

### Systems That Depend On This Epic

| System           | What It Consumes    | How Used              |
| ---------------- | ------------------- | --------------------- |
| Chat encryption  | Stronger algorithms | Private tier messages |
| Asset encryption | Better performance  | Large file encryption |
| Key derivation   | Argon2id            | Passphrase-based keys |

## Tickets

- `TASK-non-standard-browser-crypto-research.md` — ⬜ Research phase

## Success Criteria

- [ ] Research doc comparing JS/WASM crypto options
- [ ] Benchmark data: WASM vs JS vs WebCrypto for target algorithms
- [ ] Selected library with rationale
- [ ] Integration plan with existing `browser-crypto.ts`
- [ ] CSP impact analysis
- [ ] Bundle size delta estimate
- [ ] **Data consistency hashing spec** — asset/message/key integrity design with schema changes
