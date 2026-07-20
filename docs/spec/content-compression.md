> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Content Compression

Status: Built. Used by crypto pipeline, build pipeline, storage layer.
Source: `src/content/` (encode, decode, compress, minify, hash-injection).

---

## Compression Algorithms

| Algorithm | Priority             | Used For                             |
| --------- | -------------------- | ------------------------------------ |
| gzip      | 1st (config default) | Crypto pipeline, build artifacts     |
| brotli    | 2nd                  | Build artifacts                      |
| zstd      | 3rd                  | Build artifacts (fastest decompress) |
| identity  | fallback             | Sub-threshold / failure fallback     |

Source: `src/content/encode.ts`, `src/content/decode.ts`, `src/content/types.ts`.

---

## Compress-Decode Pipeline

- `src/content/compress.ts` — `compressFile()` and `copyDirectory()` for build-time static asset compression. Produces `.gz`, `.br`, `.zst`.
- `src/content/hash-injection.ts` — `injectContentHashes()` replaces asset refs in HTML/CSS with content-hash URLs for cache busting.
- `src/content/minify.ts` — strips HTML comments, whitespace, `data-testid`. Used by `src/build/compress.ts`.

## Threshold Logic

Compression skipped below 128 bytes (`COMPRESS_THRESHOLD`). Fallback chain: config default → gzip → brotli → zstd → identity. Each algo must produce smaller output.

## Encoding Detection

`encodeContent(text, algo)` → `{ encoding, encoded }`. `decodeContent(data, algo)` → plaintext.
NOT auto-detected — caller must know algo. `EncryptedPayload.compAlgo` tracks it for encrypted content. Plain `messages.content` uses `content_encoding` column.

## Build Pipeline — `src/build/compress.ts`

Invoked via `bun run build`. Steps:

---

## References

- `src/content/index.ts` — barrel exports
- `src/content/types.ts` — `ContentEncoding` type
- `src/crypto/pipeline.ts` — compress-then-encrypt integration
- `docs/frontend/encryption.md` — compress-encrypt pipeline UX
