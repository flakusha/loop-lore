<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: WebP as a first-class stored asset format

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-asset-platform-capabilities
**Tags:** assets
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Make the stored image format authoritative: derive the MIME type and the stored file extension from the actual bytes, not from the client's claim and the uploaded filename.

WebP is already accepted, stored and parsed. The gap is that the storage layer treats the format as opaque — `assets.mime_type` is the client-declared type (`src/assets/controller.ts`) and the stored extension is derived from the filename (`src/assets/service/file-system.ts`). Neither is ever checked against the bytes.

## Context

Research note: `docs/meta/research/webp-first-class-storage.md` (findings F2 and F4, `Recommended shape` → `Ticket A`).

A PNG uploaded as `photo.webp` with `Content-Type: image/webp` is stored at `raw/xx/yy/<id>.webp` with `mime_type = image/webp` and is served with `Content-Type: image/webp`. The extension, the declared type, and the actual bytes are three independent things.

This is the prerequisite for `TASK-asset-download-format-conversion-webp-png-jpg.md`: conversion needs to know the input format, and today the server does not.

Related: `TASK-replace-hand-rolled-image-header-probing-in-src-assets-with-.md` argues for replacing the hand-rolled header parsers in `src/assets/metadata.ts` with sharp. That decision should be made once, not twice — a `mimeFromBytes` built on sharp and a parser built by hand are two different answers to the same question.

## Change

1. Add a `mimeFromBytes(buffer)` helper next to `mimeFromExtension` in `src/assets/service/detect.ts`. It must distinguish the WebP chunk layouts (VP8 / VP8L / VP8X) and the PNG / JPEG / GIF signatures, and return `null` for an unrecognised buffer. Two WebP parser bugs were already found and fixed in `src/assets/metadata.ts` (`BUG-asset-webp-metadata-vp8l-vp8x-off-bytes`, `BUG-asset-webp-vp8x-dimension-truncation`), so the WebP header handling is the known weak spot.
2. At the upload seam (`src/assets/controller.ts`), detect the MIME from the bytes and reject a mismatch between the declared type and the detected type with 400. Do not silently trust either side.
3. Store the extension derived from the **detected** MIME rather than from the filename, so `assets.storage_path` and `assets.mime_type` cannot disagree. `extensionForMime` (`src/assets/service/detect.ts`) already maps mime → extension.
4. Keep `assets.mime_type` as the single source of truth for the served `Content-Type`.
5. Give `/compressed` a real variant or retire the route. `resolveCompressedVariantPath` (`src/assets/variant-path.ts`) looks for `compressed/<aa>/<bb>/<assetId>_<variant>.webp`, but nothing ever writes that path — the only writer under `compressed/` is `<assetId>_thumb.webp` (`src/assets/service/thumbnail.ts`). `GET /assets/:id/compressed` therefore always falls back to the raw bytes and is a permanent alias for `/raw`.

## Acceptance Criteria

- [ ] A PNG uploaded with `Content-Type: image/webp` is rejected with 400 (declared type does not match the bytes).
- [ ] A PNG uploaded as `photo.webp` with `Content-Type: image/png` is stored under a `.png` extension and served with `Content-Type: image/png`.
- [ ] A real WebP (VP8, VP8L and VP8X) uploads, stores with a `.webp` extension, and is served with `Content-Type: image/webp`.
- [ ] `mimeFromBytes` returns `null` for a buffer that is not a recognised image, and the upload of such a buffer is rejected.
- [ ] `assets.storage_path` and `assets.mime_type` never disagree for any asset created after the change.
- [ ] `GET /assets/:id/compressed` either serves a distinct stored variant or the route is removed and its callers are migrated — it no longer silently returns the raw bytes.
- [ ] Tests cover: PNG-as-webp rejected; WebP accepted and served; unrecognised bytes rejected; VP8L and VP8X WebP detected correctly.

## Caveats

- **Security:** this is a trust boundary. The detection must happen on the bytes the server received, before anything is written, and the rejected upload must leave no file and no row.
- **TOCTOU:** detect the format from the same buffer that is then stored. Do not re-read the file to detect after writing it.
- **Partial failure:** if detection succeeds but the write fails, no row must remain. If detection fails, the request is rejected — not stored with a guessed type.
- **Idempotency:** the `content_hash` dedup key (`src/assets/service/create.ts`) is computed over the bytes, so changing the stored extension does not change the dedup behaviour. Two uploads of the same bytes under different filenames must still dedup to one row.
- **Backwards compatibility:** existing rows keep their declared `mime_type`. Do not add a backfill that rewrites historical rows — a row whose declared type disagrees with its bytes is pre-existing state, not a bug to auto-fix.
- **Stale state:** `assets.mime_type` is read by the serve path, the gallery and the RAG indexer. Changing what a new row stores does not change what those readers do with an old row.
- **Observability:** a rejected upload must log the declared type and the detected type, so a client sending a wrong `Content-Type` is diagnosable.
- **Rollback:** the detection helper is additive. Rejecting mismatches can be turned off without a migration.
- **Parallelism / data races:** two concurrent uploads of the same bytes must both detect the same format and must not race on the stored extension.
- **Lock/unlock lifecycle:** no lock is taken; detection is pure computation over the in-memory buffer.
- **Resource limits:** detection reads only the header bytes, not the whole file. A file whose header lies about its size must not make the detector allocate.
