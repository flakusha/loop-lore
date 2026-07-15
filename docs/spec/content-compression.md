# Content Compression

> **Status:** Built. Used by crypto pipeline, build pipeline, and storage layer.
> Source: `src/content/` (encode, decode, compress, minify, hash-injection).

---

## Compression Algorithms

| Algorithm | Codec           | Priority             | Used For                             |
| --------- | --------------- | -------------------- | ------------------------------------ |
| gzip      | `encode/decode` | 1st (config default) | Crypto pipeline, build artifacts     |
| brotli    | `encode/decode` | 2nd                  | Build artifacts (smaller than gzip)  |
| zstd      | `encode/decode` | 3rd                  | Build artifacts (fastest decompress) |
| identity  | passthrough     | fallback             | Sub-threshold / failure fallback     |

Source: `src/content/encode.ts`, `src/content/decode.ts`, `src/content/types.ts`.

---

## Compress-Decode Pipeline

`src/content/compress.ts` — `compressFile()` and `copyDirectory()` for build-time
static asset compression. Produces `.gz`, `.br`, `.zst` variants alongside originals.

`src/content/hash-injection.ts` — `injectContentHashes()` replaces asset references
in HTML/CSS with content-hash URLs for cache busting.

`src/content/minify.ts` — strips HTML comments, whitespace, `data-testid` attributes.
Used by `src/build/compress.ts` during dist build.

---

## Threshold Logic

Compression skipped for payloads below `COMPRESS_THRESHOLD` (128 bytes default).
Configured via `PipelineConfig` in crypto pipeline; also applies to content storage.

Algorithm fallback chain: config default → gzip → brotli → zstd → identity (plaintext).
Each algorithm must produce smaller output than input. If none does, identity used.

---

## Encoding Detection

`src/content/encode.ts` `encodeContent(text, algo)` → `{ encoding, encoded }`
`src/content/decode.ts` `decodeContent(data, algo)` → plaintext

Encoding is NOT auto-detected — caller must know/remember which algorithm was used.
The `EncryptedPayload.compAlgo` field in crypto pipeline tracks this for encrypted content.
For plain `messages.content`, stored in `content_encoding` column.

---

## Build Pipeline Integration

`src/build/compress.ts` — invoked via `bun run build`. Steps:

1. Copy `src/public/` + `src/views/` + `src/components/` to `dist/public/`
2. `injectContentHashes()` — replace asset URLs with hash-versioned paths
3. Strip HTML comments + `data-testid` attributes
4. Compress each file as gzip/brotli/zstd in parallel
5. Write compressed variants alongside originals

Server serves pre-compressed variants (`.gz`/`.br`/`.zst`) when `Accept-Encoding`
matches, falling back to runtime compression via `DynamicResponsePolicy`.

---

## Remaining Work

- [ ] Try/catch around single file compression in `src/build/compress.ts` (open item)
- [ ] Auto-detect encoding on decode (currently caller must specify algo)
- [ ] Async background compression for asset uploads (per backlog.md)
- [ ] Compression level tuning per algorithm (currently default levels only)

---

## References

- `src/content/index.ts` — barrel exports
- `src/content/types.ts` — `ContentEncoding` type, declarations
- `src/crypto/pipeline.ts` — compress-then-encrypt integration
- `docs/frontend/encryption.md` — compress-encrypt pipeline UX
- `docs/meta/open-items.md` — known build compression issues
