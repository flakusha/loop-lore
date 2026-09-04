# TASK: Crypto hardening minors: algo field decorative, PBKDF2 hot-path, silent key fallback, unvalidated api_key, lazy key creation

**Status:** ✅ Resolved (2026-09-04)
**Priority:** medium
**Effort:** Medium

## Summary

src/crypto/pipeline.ts:150 — decryptThenDecompress checks algo presence only, never enforces 'aes-256-gcm'; reject unknown values (downgrade detection). src/crypto/byok.ts:45 — PBKDF2 100k iterations re-run every encrypt/decrypt call; cache derived CryptoKey by secret hash. src/generation/providers/registry.ts:95 — BYO key decrypt failure silently falls through to server key; log warn with provider+userId. src/routes/api-keys.ts:63 — api_key body value not validated (length/charset) before encryption/storage. src/crypto/chat-keys.ts:109 — lazy chat_keys row creation inside deriveChatKeyForChat read path; make creation explicit write-path concern.

## Resolution

Resolved by `516643b6` (`fix(security): logging + crypto hardening minors`).

Fixed:
- `src/crypto/pipeline.ts` — `decryptThenDecompress` rejects `payload.algo !== "aes-256-gcm"` with `Unsupported encryption algorithm` (downgrade detection).
- `src/generation/providers/registry.ts` — BYO-key decrypt failure now logs `getLogger().warn(...)` with provider + userId instead of silently swallowing.
- `src/validation/schemas/api-keys.ts` — `ApiKeyCreateBody.api_key` constrained to `{ minLength: 1, maxLength: 512, pattern: "^[\\x20-\\x7e]+$" }`.

Dropped (stale / deliberate design):
- PBKDF2 hot-path — `src/crypto/byok.ts` already migrated to HKDF; no per-call PBKDF2 re-run.
- `chat_keys` lazy creation — documented design ("loads or creates this key lazily", `chat-keys.ts`) relied on by 4 call sites; making it explicit is risky churn with no functional gain.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
