# BUG: safeDecompress pre-check rejects compressed payloads over ~10KB (silent garbage reads)

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Small

## Summary

Location: src/utils/safe-buffer/compression.ts safeDecompress pre-check + src/crypto/pipeline.ts decryptThenDecompress swallow + src/routes/messages/helpers.ts resolveMessageContent.

Symptom: any gzip/brotli/zstd payload whose COMPRESSED size exceeds maxSize/maxRatio (10485760/1000 = 10,485 B) is rejected before decompression. Write side accepts (safeCompress caps input at 10MB), read side fails:
- unencrypted rows (content_encoding=gzip): decodeContent throws -> read routes render "[Encrypted - unable to decrypt]" on a chat that is not even encrypted
- standard-tier encrypted rows: decryptThenDecompress catches the throw and returns the base64 ciphertext-of-compressed blob AS the plaintext (spec'd fallback) -> user silently sees base64 garbage

Evidence (repro): bun probe .tmp/probe-crypto-flow4.ts - 2.14MB plaintext -> comp=true gzip -> read-back returns 'H4sIAAAA...' instead of plaintext. Probe 3: 12KB random-base64 body -> decode throws 'Compressed data too large for safe decompression: 12358 bytes (max: 10485)'.

Root cause: pre-check conflates compressed size with expansion ratio. A 500KB gzip of already-dense content is legal; ratio bombs are already bounded by the POST-decompress size check (maxSize) and ratio check (maxRatio) which run after gunzip.

Fix: delete the data.length > maxSize/maxRatio pre-check entirely; keep post-decompress checks. Optionally stream-decompress with a hard output cap for constant-memory safety. While in there: docstring says default ratio 100x but DEFAULT_MAX_RATIO is 1000x - fix doc; pipeline should always emit compAlgo (today missing field triggers a blind gzip guess).

Acceptance:
- [ ] round-trip of >10KB-compressed content works through encode/decode AND compressThenEncrypt/decryptThenDecompress
- [ ] zip-bomb tests still pass (post-checks intact)
- [ ] unit test covering compressed-size > 10KB happy path

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Fixed in src/utils/safe-buffer/compression.ts (pre-check deleted; post-decompress checks intact; docstring ratio corrected). Verified in this worktree (round-6 batch, 2026-09-06).
