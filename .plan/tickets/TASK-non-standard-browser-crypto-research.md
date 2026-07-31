# TASK: Non-Standard Browser Crypto Research

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med
**Epic:** epic-non-standard-browser-crypto

## Summary

Research JS and WASM-compiled crypto libraries for browser-side encryption
beyond WebCrypto API. Evaluate algorithms (ChaCha20-Poly1305, Argon2id,
Blake3), benchmark performance, and recommend integration path.

## Motivation

Current browser crypto (`src/frontend/browser-crypto.ts`) uses only
WebCrypto API (AES-256-GCM). limitations:

- No ChaCha20-Poly1305 (faster on mobile, no HW AES)
- No Argon2id (memory-hard KDF, better than PBKDF2)
- No post-quantum algorithms
- Limited key derivation options

## Research Scope

### 1. Library Evaluation

| Library          | Type    | Algorithms                     | Bundle Size | Maintained |
| ---------------- | ------- | ------------------------------ | ----------- | ---------- |
| libsodium.js     | WASM+JS | ChaCha20, Argon2, Ed25519, etc | ~200KB WASM | ✅ Active  |
| TweetNaCl.js     | JS      | XSalsa20, Ed25519, Curve25519  | ~7KB        | ⚠️ Stale    |
| SJCL             | JS      | AES, SHA, PBKDF2, HMAC         | ~15KB       | ⚠️ Stale    |
| noble-curves     | JS      | Ed25519, secp256k1, etc        | ~30KB       | ✅ Active  |
| noble-hashes     | JS      | SHA, Blake3, Argon2, etc       | ~20KB       | ✅ Active  |
| wasm libsodium   | WASM    | Full sodium API                | ~250KB      | ✅ Active  |
| Rust-wasm crypto | WASM    | ChaCha20, Argon2, X25519       | Custom      | Build own  |

### 2. Algorithm Comparison

| Algorithm          | WebCrypto | libsodium | TweetNaCl   | noble | Use Case         |
| ------------------ | --------- | --------- | ----------- | ----- | ---------------- |
| AES-256-GCM        | ✅        | ✅        | ❌          | ❌    | Current default  |
| ChaCha20-Poly1305  | ❌        | ✅        | ✅ (XSalsa) | ❌    | Mobile, fallback |
| XChaCha20-Poly1305 | ❌        | ✅        | ✅          | ❌    | Random nonces    |
| Argon2id           | ❌        | ✅        | ❌          | ✅    | Key derivation   |
| PBKDF2             | ✅        | ✅        | ❌          | ❌    | Current KDF      |
| Blake3             | ❌        | ✅        | ❌          | ✅    | Fast hashing     |
| Ed25519            | ❌        | ✅        | ✅          | ✅    | Signatures       |
| X25519             | ❌        | ✅        | ✅          | ✅    | Key exchange     |

### 3. Performance Benchmarks (To Run)

Test on: Chrome, Firefox, Safari (desktop + mobile)

| Operation             | WebCrypto AES | libsodium WASM | libsodium JS | TweetNaCl JS |
| --------------------- | ------------- | -------------- | ------------ | ------------ |
| Encrypt 1KB           |               |                |              |              |
| Encrypt 100KB         |               |                |              |              |
| Derive key (PBKDF2)   |               |                |              |              |
| Derive key (Argon2id) | N/A           |                | N/A          | N/A          |
| Key generation        |               |                |              |              |
| WASM load time        | N/A           |                | N/A          | N/A          |

### 4. Bundle Size Analysis

| Option                          | Gzipped Size | Notes                   |
| ------------------------------- | ------------ | ----------------------- |
| Current (WebCrypto only)        | ~0KB         | No deps, native API     |
| + noble-hashes (Blake3, Argon2) | ~25KB        | Pure JS, no WASM        |
| + libsodium.js (full)           | ~200KB       | WASM + JS wrapper       |
| + libsodium WASM (minimal)      | ~150KB       | WASM only, custom build |
| + TweetNaCl.js                  | ~7KB         | Limited algorithms      |

### 5. CSP Impact

| Option         | CSP Change Required             | Risk   |
| -------------- | ------------------------------- | ------ |
| Pure JS libs   | None (same-origin bundle)       | Low    |
| WASM file      | `wasm-unsafe-eval` or `'self'`  | Medium |
| WASM in Worker | `worker-src 'self'` + WASM rule | Medium |
| External CDN   | `script-src` CDN domain         | High   |

### 6. Integration Design

Current `browser-crypto.ts` exports:

- `browserEncryptContent(plaintext, key) → BrowserEncryptResult`
- `browserDecryptContent(ciphertext, nonce, key) → string`
- `browserImportKey(base64Key) → CryptoKey`
- `browserExportKey(key) → string`
- `browserGenerateKey() → CryptoKey`

**Proposed abstraction:**

```typescript
interface CryptoProvider {
  name: string;
  isAvailable(): boolean;
  encrypt(plaintext: Uint8Array, key: CryptoKey | Uint8Array,): Promise<EncryptedResult>;
  decrypt(ciphertext: Uint8Array, nonce: Uint8Array, key: CryptoKey | Uint8Array,): Promise<Uint8Array>;
  generateKey(): Promise<CryptoKey | Uint8Array>;
  deriveKey(password: string, salt: Uint8Array,): Promise<CryptoKey | Uint8Array>;
}

// Fallback chain:
const providers: CryptoProvider[] = [
  libsodiumProvider, // WASM, best algorithms
  nobleProvider, // Pure JS, good algorithms
  webCryptoProvider, // Native, limited algorithms
];
```

### 7. Key Derivation Comparison

| KDF      | Time (browser) | Memory  | GPU-resistant | WebCrypto |
| -------- | -------------- | ------- | ------------- | --------- |
| PBKDF2   | ~100ms         | Minimal | ❌            | ✅        |
| Argon2id | ~500ms (WASM)  | 64MB+   | ✅            | ❌        |
| scrypt   | ~200ms (JS)    | 16MB+   | ✅            | ❌        |
| Blake3   | ~1ms           | Minimal | ❌            | ❌        |

## Deliverables

- [ ] Research doc with findings
- [ ] Benchmark results (table format)
- [ ] Library recommendation with rationale
- [ ] Integration plan (code sketch)
- [ ] CSP impact report
- [ ] Bundle size estimate
- [ ] Fallback chain design
- [ ] **Data consistency hashing spec** — asset + message + key integrity design

## Data Consistency: Hashing Research

### Problem

Encrypted data stored in DB relies solely on AES-GCM auth tag for integrity.
Edge cases where auth tag alone is insufficient:

- Key rotation → re-encryption changes ciphertext, old hash invalid
- Migration/backup restore → partial writes may pass GCM check
- Storage bit-flip → GCM catches most but not all corruption patterns
- Concurrent clobber → two writes to same row, one lost

### Required Hashing

| Entity              | Hash Target             | Storage Column          | Verify On               | Algorithm      |
| ------------------- | ----------------------- | ----------------------- | ----------------------- | -------------- |
| Asset (plaintext)   | Original blob bytes     | `assets.content_hash`   | Download (post-decrypt) | BLAKE3/SHA-256 |
| Asset (encrypted)   | Encrypted payload       | `assets.payload_hash`   | Load (pre-decrypt)      | BLAKE3/SHA-256 |
| Message (encrypted) | `messages.content` JSON | `messages.payload_hash` | Read (pre-decrypt)      | BLAKE3/SHA-256 |
| Actor key (wrapped) | Wrapped key bytes       | `actor_keys.key_hash`   | Unwrap (pre-decrypt)    | BLAKE3/SHA-256 |

### Research Questions

1. **Algorithm**: BLAKE3 vs SHA-256? Tradeoffs: speed vs ubiquity vs WASM support
2. **Where to hash**: Browser-side (on encrypt) vs server-side (on store)?
3. **Granularity**: Per-row hash vs Merkle tree for batch verification?
4. **Migration**: How to backfill hashes on existing encrypted data?
5. **Performance**: Hash cost relative to encrypt cost? (BLAKE3: ~1GB/s, negligible)
6. **Storage**: Hash column type (TEXT hex? BLOB? fixed-width?)

### Schema Changes (Proposed)

```sql
-- Assets: dual hash (plaintext + encrypted)
ALTER TABLE assets ADD COLUMN content_hash TEXT;   -- BLAKE3 of original bytes
ALTER TABLE assets ADD COLUMN payload_hash TEXT;   -- BLAKE3 of encrypted JSON

-- Messages: encrypted payload hash
ALTER TABLE messages ADD COLUMN payload_hash TEXT; -- BLAKE3 of content JSON

-- Keys: wrapped key hash
ALTER TABLE actor_keys ADD COLUMN key_hash TEXT;   -- BLAKE3 of wrapped key bytes
```

### Flow

```
Upload:
  plaintext → hash(plaintext) → encrypt → hash(encrypted) → DB write
                                                        ↓
                                            content_hash + payload_hash stored

Download:
  DB load → verify payload_hash → decrypt → verify content_hash → serve
               ↓ mismatch                           ↓ mismatch
          return 500 + audit log              return 500 + audit log
```

### Acceptance Criteria (Hashing)

- [ ] BLAKE3 vs SHA-256 recommendation with rationale
- [ ] Browser-side hashing feasibility (BLAKE3 WASM vs native SHA-256)
- [ ] Server-side hashing integration points
- [ ] Schema migration plan for existing data
- [ ] Audit log design for hash mismatches
- [ ] Performance impact assessment

## Acceptance Criteria

- [ ] All 6 libraries evaluated (at least API-level review)
- [ ] Benchmark suite runs on 3+ browsers
- [ ] Recommendation includes: library, algorithms, fallback chain
- [ ] Integration plan shows how to extend `browser-crypto.ts`
- [ ] CSP changes documented (if any)
- [ ] Bundle size delta measured (not estimated)

## Files to Reference

- `src/frontend/browser-crypto.ts` — current impl
- `src/frontend/browser.ts` — compress-encrypt pipeline
- `docs/frontend/encryption.md` — encryption spec
- `.plan/epics/epic-crypto.md` — parent epic

## Files to Create

- `docs/meta/research/non-standard-browser-crypto.md` — research findings

## Risk

Low — research only, no production code changes.

## Timebox

2-3 days for research + benchmarks.
