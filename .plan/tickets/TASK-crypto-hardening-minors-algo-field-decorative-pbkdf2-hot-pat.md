# TASK: Crypto hardening minors: algo field decorative, PBKDF2 hot-path, silent key fallback, unvalidated api_key, lazy key creation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/crypto/pipeline.ts:150 — decryptThenDecompress checks algo presence only, never enforces 'aes-256-gcm'; reject unknown values (downgrade detection). src/crypto/byok.ts:45 — PBKDF2 100k iterations re-run every encrypt/decrypt call; cache derived CryptoKey by secret hash. src/generation/providers/registry.ts:95 — BYO key decrypt failure silently falls through to server key; log warn with provider+userId. src/routes/api-keys.ts:63 — api_key body value not validated (length/charset) before encryption/storage. src/crypto/chat-keys.ts:109 — lazy chat_keys row creation inside deriveChatKeyForChat read path; make creation explicit write-path concern.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
