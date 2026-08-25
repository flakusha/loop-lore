# BUG: browser zstd decompress uses fixed 16x output capacity - high-ratio payloads silently return base64

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

Location: src/frontend/browser-compress.ts tryZstdDecompress (wasm.zstd.decompress(data, data.length * 16)).

Symptom: backend safeDecompress allows expansion up to 1000x; the browser decoder caps output at 16x compressed size. Natural-language or repetitive JSON zstd-compressed by the server routinely exceeds 16x -> wasm.decompress returns null -> browserDecodeContent falls through and returns the stored base64 string as 'decoded' content. Silent garbage in the UI, no error surfaced.

Fix: two-pass sizing - call a decompressedSize()/decompressBound probe if the WASM exports one, else grow-and-retry loop (cap at safeDecompress's 1000x for parity); on final failure, THROW instead of returning stored input so callers can distinguish corruption from identity content. While there: getDecoderPriority brute-forces gzip/brotli/zstd regardless of declared encoding - keep, but log when the declared algo was not the one that succeeded.

Acceptance:
- [ ] round-trip test with >16x ratio zstd payload decodes correctly
- [ ] undecodable payload throws rather than returning base64
- [ ] parity unit test vs backend safeDecompress limits

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
