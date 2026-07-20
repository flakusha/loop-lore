# TASK: Encryption — Browser Pre-Encrypt Integration

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-wire-message-pipeline

## Summary

Wire existing `src/frontend/browser.ts` (browser-side pre-encrypt) into the chat UI. Messages are encrypted in-browser before sending to server for true e2e.

## What Exists

- `src/frontend/browser.ts` — browser-side pre-encrypt (exists, not wired)
- `docs/frontend/encryption.md` — full spec for browser-side flow

## Design

```
User types message
  ↓
Browser-side:
  ├── Derive key from user's actor key
  ├── Encrypt message content
  └── Send encrypted payload to server
  ↓
Server stores encrypted payload (cannot decrypt)

Other participants:
  ├── Receive encrypted payload
  ├── Derive key from their actor key
  └── Decrypt in browser
```

## Fallbacks Support

| Scenario | Fallback | Notes |
| -------- | -------- | ----- |
| Web Crypto unavailable (HTTP) | Server-side encrypt | Warn user: "E2E requires HTTPS" |
| Web Crypto unavailable (old browser) | Server-side encrypt | Show upgrade prompt |
| Compression Streams unavailable | Skip compression | Encrypt uncompressed (larger payload) |
| Key derivation fails | Server-side encrypt | Log error, degrade gracefully |
| IndexedDB unavailable | In-memory key storage | Session-only keys, warn on reload |
| WASM unavailable | Pure JS fallback | Slower but functional (if using argon2) |

### Detection
```typescript
const hasWebCrypto = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
const hasCompressionStreams = typeof CompressionStream !== 'undefined';
const hasIndexedDB = typeof indexedDB !== 'undefined';
const isSecureContext = window.isSecureContext; // HTTPS required for Web Crypto
```

## Platform Considerations

| Platform | Issue | Mitigation |
| -------- | ----- | ---------- |
| Safari (iOS) | Web Crypto requires HTTPS even on localhost | Dev: use HTTPS or server-side |
| Mobile browsers | Key derivation slower on low-end devices | Show progress indicator |
| Web Workers | Web Crypto available, CompressionStreams may not | Test per-worker |
| Firefox | Compression Streams behind flag (pre-2024) | Feature detect, fallback |
| Electron/Tauri | Full API available | No special handling |

## Performance Considerations

| Operation | Cost | Mitigation |
| --------- | ---- | ---------- |
| Key derivation (PBKDF2) | ~100ms | Cache derived keys in memory |
| Key derivation (Argon2) | ~500ms (WASM) | Use PBKDF2 for browser, Argon2 server-side |
| AES-256-GCM encrypt | <1ms | No mitigation needed |
| Compression (gzip) | ~5ms for 1KB | Only compress above threshold (128 bytes) |
| Large messages (>10KB) | ~50ms | Show encryption indicator, async |
| Key export/import | ~10ms | Cache in IndexedDB |

### Key Caching Strategy
```
Browser key lifecycle:
  1. Derive key on first use (PBKDF2 from user password)
  2. Cache in IndexedDB (encrypted with device key)
  3. Reuse for session duration
  4. Re-derive on new session (or load from IndexedDB)
```

## Scripts Shipping & CSP Policy

### Current CSP
- `default-src 'self'`
- Nonce-based `script-src`
- No `node_modules` serving

### Shipping Strategy

| Option | Pros | Cons |
| ------ | ---- | ---- |
| Bundle with app JS | Simple, no CSP changes | Larger bundle |
| Separate chunk (lazy load) | Smaller initial load | Extra HTTP request |
| WASM file (for argon2) | Fast, native-like | CSP `wasm-unsafe-eval` needed |

### CSP Adjustments Needed

```
# If using WASM for argon2:
script-src 'self' 'nonce-{nonce}' 'wasm-unsafe-eval';

# If shipping as bundled JS:
# No CSP changes needed (same-origin)
```

### node_modules Serving

- **Do NOT serve from node_modules** — violates CSP `default-src 'self'`
- **Bundle at build time** — include crypto libs in app bundle
- **Alternative**: serve from `/static/vendor/` (same-origin, CSP-safe)

### Recommended Approach

1. **PBKDF2 for browser** (native Web Crypto, no deps)
2. **Argon2 for server-side** (via `src/crypto/`)
3. **Bundle browser-crypto** with app JS (no separate chunk)
4. **No WASM** unless argon2 required in browser

## Tasks

- [ ] Audit `src/frontend/browser.ts` — what's implemented
- [ ] Audit `src/frontend/browser-crypto.ts` — crypto operations
- [ ] Audit `src/frontend/browser-compress.ts` — compression
- [ ] Add feature detection (Web Crypto, CompressionStreams, IndexedDB)
- [ ] Add fallback chain: browser → server-side
- [ ] Add HTTPS check — warn if HTTP (Web Crypto unavailable)
- [ ] Add key caching in IndexedDB
- [ ] Add PBKDF2 key derivation (browser-safe)
- [ ] Wire into chat message send flow
- [ ] Wire into chat message receive flow
- [ ] Add encryption indicator in chat UI (lock icon)
- [ ] Add performance: progress indicator for large messages
- [ ] Bundle with app JS (no separate chunk)
- [ ] Test: Safari, Firefox, mobile browsers
- [ ] Add tests: encrypt on send, decrypt on receive, fallbacks

## Files to Create

- `src/frontend/browser-feature-detect.ts` — feature detection + fallback chain
- `src/frontend/browser-key-cache.ts` — IndexedDB key caching

## Files to Modify

- `src/frontend/browser.ts` — integration + fallbacks
- `src/frontend/browser-crypto.ts` — PBKDF2 derivation
- `src/frontend/alpine/chat.ts` — wire encrypt/decrypt
- `src/views/chat.html` — encryption indicator
- `src/build/` — bundle config (ensure browser-crypto included)

## Risk

Med — platform quirks, fallback chain complexity, CSP compliance, performance on mobile.
