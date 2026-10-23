# WebP as a first-class stored format, and format-converting downloads

Research note for the asset platform. Goal: establish what "WebP first-class
storage" actually means in this codebase, and what a
"download as webp/png/jpg" endpoint would have to do. Every claim below was
read from the tree on `dev` at `fcf0b60d`; the behavioural claims were
additionally executed (see [Verification](#verification)).

## Summary

WebP uploads already work. The gap is not "accept webp" — it is that the
storage layer treats the image format as **opaque and unverified**: the MIME
type comes from the client's claim, the file extension comes from the
filename, and the two are never reconciled against the actual bytes. A
format-converting download cannot be built on top of that, because the server
does not know what format the stored bytes are in.

Two defects surfaced while mapping the serve path. Both are in the encrypted
asset path, and one of them is a **plaintext leak** that a ticket currently
marked `Done` claims to have fixed.

| # | Finding | Severity |
|---|---------|----------|
| F1 | An encrypted asset's thumbnail is stored and served in **plaintext** | high |
| F2 | The `compressed` variant has no writer; the endpoint is a permanent alias for `/raw` | medium |
| F3 | The fix for `BUG-encrypted-asset-thumb-compressed-preview-serves-raw-cipherte` was silently dropped by a refactor — the ticket says `Done`, the code has no guard | high |
| F4 | Upload stores the client-declared MIME and the filename-derived extension; the bytes are never checked | medium |
| F5 | No format conversion exists on any serve route | low (by design today) |

## Current state

### Storage

- `src/assets/controller.ts` — the upload handler takes
  `file.type` (client-declared) as the MIME and runs it through
  `validateMimeType`. **There is no magic-byte check.**
- `src/assets/service/validate.ts` — the allowlist is prefix-based
  (`image/`, `audio/`, `video/`, …) with `image/svg+xml` blocked. WebP passes.
- `src/assets/service/create.ts` — `storeFile(uploadDir, id, input.filename, storageBuffer)`
  writes the **original bytes** (encrypted or not) under an extension derived
  from the filename.
- `src/assets/service/file-system.ts` — extension comes from
  `filename.split(".").pop()`; the layout is `raw/<aa>/<bb>/<assetId>.<ext>`.
- `src/assets/service/create.ts` — `mime_type: input.mimeType` stores the
  declared type verbatim.
- `src/assets/service/detect.ts` — `MIME_MAP` already knows
  `webp`, `avif`, `gif`, and `extensionForMime` is the inverse map. What is
  missing is `mimeFromBytes`.

So a PNG uploaded as `photo.webp` with `Content-Type: image/webp` is stored at
`raw/xx/yy/<id>.webp` with `mime_type = image/webp` and is later served with
`Content-Type: image/webp`. The extension, the declared type, and the actual
bytes are three independent things.

### Thumbnails and variants

- `src/assets/service/thumbnail.ts` — `sharp(buffer).resize(256, 256, {fit: "inside"}).webp({quality: 85})`.
  Best-effort: a decode failure leaves `thumbnail_path` null and the serve
  path falls back to raw.
- `src/assets/service/thumbnail.ts` — the thumbnail is written to
  `compressed/<aa>/<bb>/<assetId>_thumb.webp`. **This is the only writer into
  the `compressed/` tree.**
- `src/assets/variant-path.ts` — `resolveCompressedVariantPath` looks
  for `thumbnail_path` (only for `variant === "thumb"`) and then
  `compressed/<aa>/<bb>/<assetId>_<variant>.webp`.
- `src/assets/serve-handlers.ts` — `handleServeCompressed` serves the
  variant as `image/webp`, or falls back to the **raw bytes** with the asset's
  stored MIME.

Because nothing writes `<assetId>_compressed.webp`, `GET /assets/:id/compressed`
can never find a variant. It is a permanent alias for `/raw`.

### Serving

Routes (`src/assets/controller.ts`, mounted under `/api/v1` by
`src/routes/v1/content-surface.ts`):

| Method | Path | Handler |
|---|---|---|
| GET | `/api/v1/assets/:id/raw` | `handleServeRaw` |
| GET | `/api/v1/assets/:id/download` | `handleDownload` |
| GET | `/api/v1/assets/:id/thumb` | `handleServeCompressed` (`variant: "thumb"`) |
| GET | `/api/v1/assets/:id/compressed` | `handleServeCompressed` (`variant: "compressed"`) |

- `src/assets/serve-raw.ts` — `handleDownload`. For an encrypted asset
  it derives the chat key, decrypts, and responds with
  `Content-Type: asset.mime_type` and
  `Content-Disposition: attachment; filename="<sanitized original name>"`.
  For a public asset it serves the file with the stored MIME.
- `src/assets/serve-raw.ts` — the encrypted branch returns **400**
  when there is no chat context. The raw path is gated correctly.
- `src/assets/signed-url.ts` — signed-URL actions are
  `raw | download | thumb | compressed | matted`.
- No route anywhere in `src/assets/` reads a `format` query parameter.

### Dependencies already in place

`sharp` is a **runtime** dependency (`package.json`) and is already used
for the thumbnail encode. A download-conversion endpoint needs no new
dependency.

## Findings

### F1 — An encrypted asset's thumbnail is stored and served in plaintext

`src/assets/service/create.ts` generates the thumbnail from
`input.buffer` — the **plaintext** image — and `writeThumbnail` writes it to
disk unencrypted. The raw blob in the same row is encrypted
(`src/assets/service/create.ts`), so a `chat`-tier asset ends up with an encrypted primary
file and a plaintext derivative next to it.

`handleServeCompressed` has no encryption branch, so `/thumb` serves that
plaintext derivative to anyone who passes the asset ACL — no chat key, no chat
context. The thumbnail is a real, if reduced, picture of the secret image.

Executed behaviour (probe, encrypted `chat`-tier asset, no chat context):

```
raw on-disk first 8 bytes: 7b22656e63223a22     <- JSON envelope, ciphertext
raw on-disk is PNG magic:  false
thumb file exists on disk: true
thumb first 12 bytes:       524946469a00000057454250   <- RIFF/WEBP, plaintext
--- /thumb (no chat context) ---
status:        200
content-type:  image/webp
body bytes:    162
body is RIFF/WEBP: true
--- /raw (no chat context) ---
status:        400
```

`/raw` correctly refuses. `/thumb` serves the plaintext picture.

The same asset through `/compressed` returns the **ciphertext** labelled
`image/png` (330 bytes, `{"enc":…`) — a broken image, which is the defect the
existing ticket describes.

### F2 — The `compressed` variant has no writer

`resolveCompressedVariantPath` (`src/assets/variant-path.ts`) looks for
`compressed/<aa>/<bb>/<assetId>_<variant>.webp`. Grepping `src/` for a writer
of that path returns nothing; the only file written under `compressed/` is
`<assetId>_thumb.webp`. `GET /assets/:id/compressed` therefore always takes
the fallback branch and returns the raw bytes.

### F3 — The fix for the existing ticket was silently dropped

`.plan/tickets/BUG-encrypted-asset-thumb-compressed-preview-serves-raw-cipherte.md`
is marked **`Done`** and its Resolution section states:

> `src/assets/controller/serve.ts` `handleServeCompressed` now returns explicit
> `400 "Encrypted asset preview requires the raw endpoint"` when
> `asset.encryption_tier !== "public" && asset.encrypted_key_id`

The guard existed at `398651b4d` (`fix(vn): guard vn-choices under /api/v1,
reject encrypted thumb, …`) — `src/assets/controller/serve.ts`:

```ts
if (asset.encryption_tier !== "public" && asset.encrypted_key_id) {
  return new Response("Encrypted asset preview requires the raw endpoint", { status: 400, });
}
```

It is **not in the tree**. Git history shows how it went:

1. `398651b4d` (2026-09-06) adds the guard to `src/assets/controller/serve.ts`.
2. `ff0e518c6` (2026-09-11) — *feat(assets): port signed-URL serving to the
   live router* — **deletes** `src/assets/controller/serve.ts` (279 lines
   removed) and re-implements the handlers inline in `src/assets/controller.ts`.
   The guard is not carried over.
3. `6b7e5bcc5` (2026-09-11) — *refactor(assets): extract serve handlers to
   satisfy size gate* — moves the handlers to `src/assets/serve-handlers.ts`.
   Still no guard.

`398651b4d` is an ancestor of `dev`, so the ticket's `Done` is honest about
the commit but wrong about the outcome: the code it describes no longer
exists, and the behaviour it prevented is live again — and is now worse,
because the thumbnail is plaintext rather than merely mislabelled ciphertext.

A `grep` for `Encrypted asset preview requires the raw endpoint` over `src/`
returns no matches.

### F4 — The stored format is never verified against the bytes

See [Storage](#storage). The trust boundary is the upload handler, and it
trusts `file.type`. `src/assets/metadata.ts` and `src/assets/alpha-detect.ts`
already contain header parsers for PNG/JPEG/WebP/GIF, so the bytes *are*
inspected — but only after the row has been written, and the result is never
compared against the declared MIME or the stored extension.

This is why "WebP as a first-class stored format" is not a MIME-allowlist
change. WebP is already accepted, already stored, and already parsed. What is
missing is the server knowing, authoritatively, what format the stored bytes
are in.

Two WebP parsing bugs have already been found and fixed in that parser
(`BUG-asset-webp-metadata-vp8l-vp8x-off-bytes`,
`BUG-asset-webp-vp8x-dimension-truncation`, both `Done`), which is evidence
that the hand-rolled WebP header handling is the weak spot. A
`mimeFromBytes` needs to handle the VP8 / VP8L / VP8X chunk layouts.

### F5 — No format conversion

`/download` returns the stored bytes with the stored MIME. There is no
`?format=` on any route. This is fine as a default; the question is what
happens when a caller asks for a different format.

## Recommended shape

### Ticket A — WebP as a first-class stored format

The server should know the stored format from the bytes, and the stored
extension and `mime_type` should follow from that, not from the client.

1. Add a `mimeFromBytes(buffer)` helper next to `mimeFromExtension` in
   `src/assets/service/detect.ts`. It must distinguish the WebP chunk layout
   (VP8 / VP8L / VP8X) and the PNG/JPEG/GIF signatures, and return `null` for
   an unrecognised buffer. `sharp(buf).metadata()` is the alternative, but
   `TASK-replace-hand-rolled-image-header-probing-in-src-assets-with-…` already
   argues for replacing the hand-rolled parsers with sharp behind a
   try/catch — one decision, not two.
2. At the upload seam (`src/assets/controller.ts`), derive the effective
   MIME from the bytes and **reject a mismatch** between the declared type and
   the detected type (400), rather than silently trusting either.
3. Store the extension derived from the **detected** MIME, not from the
   filename, so `assets.storage_path` and `assets.mime_type` cannot disagree.
4. Keep `assets.mime_type` as the single source of truth for the served
   `Content-Type`.

This is the prerequisite for ticket B: conversion needs to know the input
format.

### Ticket B — Download as webp/png/jpg

Add `?format=webp|png|jpg` to `GET /api/v1/assets/:id/download`.

- **Validate the value against a fixed allowlist** before it reaches sharp.
  Never pass a caller-supplied format string to a codec selector.
- **Decrypt first, convert second.** For an encrypted asset the stored bytes
  are a JSON envelope; converting them would fail or produce garbage. Reuse
  the decrypt branch already in `handleDownload`
  (`src/assets/serve-raw.ts`), then convert the plaintext.
- **Set `Content-Type` and the filename extension from the requested format**,
  not from `assets.mime_type`. `Content-Disposition` currently echoes the
  original filename (`src/assets/serve-raw.ts`), which would carry the wrong
  extension.
- **Guard the alpha loss.** JPEG has no alpha. An asset whose
  `alpha_status` is `native` or `matted`
  (`src/db/enums-content.ts`) must not be silently flattened to JPEG.
  Reject with 400, or composite onto an explicit background — 400 unless a
  background is requested.
- **Do not persist the converted bytes.** This is a transport-time transform;
  writing a new row would fork the asset and break the
  `content_hash` idempotency contract (`src/assets/service/create.ts`).
  If caching is wanted later, a separate rendition table is the right home —
  the asset platform epic already lists `asset_renditions` as a gap
  (`docs/spec/assets.md`).
- **Cost.** sharp is fast but this is per-request CPU. Set
  `Cache-Control` and `Vary` on the response.

**Scope note:** keep this on `/download` only. Adding it to `/raw` as well
would double the API surface for no consumer that has been asked for.

## Interaction with the findings

F1 and F3 are independent of the WebP work but sit in the same code path and
should be filed as separate bug tickets — the plaintext thumbnail leak (F1)
and the dropped guard (F3). F3 is the more urgent of the two because it means
a `Done` ticket is not describing the code, and the class of failure — a
refactor that moves a file and silently drops a branch — is not covered by
any gate today.

F2 should be folded into ticket A rather than filed separately: once a
rendition writer exists, `/compressed` either serves a real variant or the
route should be retired.

## Verification

Behavioural claims (F1, F2) were executed, not inferred. The probe lived at
`.tmp/probe-encrypted-thumb.ts` in the research worktree and:

1. created a `chat`-tier asset with a real sharp-encoded PNG, an SMK-derived
   chat key, and `encryptionTier: "chat"`;
2. read the raw file and the thumbnail file off disk and compared their magic
   bytes against the PNG and RIFF/WEBP signatures;
3. called `handleServeCompressed` (thumb and compressed) and `handleServeRaw`
   with no chat context, and recorded status, `Content-Type` and body bytes.

Reproduce with `bun .tmp/probe-encrypted-thumb.ts` from the worktree root.
The probe is scratch tooling and is not committed.

Git-history claims (F3) were checked with `git log -S`, `git show
<commit>:<path>` and `git merge-base --is-ancestor`.

## Open questions

- Does the provider pipeline ever hand us a WebP whose bytes are VP8X with an
  animation flag? `src/assets/metadata.ts` parses the canvas size but the
  probe above did not exercise animated WebP.
- Should `/thumb` for an encrypted asset decrypt-then-derive-a-thumbnail
  (correct, but per-request CPU) or stay a hard 400 (the fix the dropped
  guard implemented)? The dropped guard chose 400. That choice should be
  re-made explicitly, not inherited from a lost commit.
- `docs/spec/assets.md` mentions `ASSET_ALLOWED_*_TYPES` env vars; the
  live path is the prefix allowlist in `src/assets/service/validate.ts`. The
  spec and the code disagree, which is worth a separate doc-drift fix.
