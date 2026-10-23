<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Asset download format conversion (webp/png/jpg)

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

Add a `?format=webp|png|jpg` query parameter to `GET /api/v1/assets/:id/download` so a caller can request a converted rendition of the stored bytes.

Today `/download` returns the stored bytes verbatim with the stored `Content-Type` (`src/assets/serve-raw.ts`). There is no format parameter on any route in `src/assets/`.

## Context

Research note: `docs/meta/research/webp-first-class-storage.md` (finding F5, `Recommended shape` → `Ticket B`).

`sharp` is already a runtime dependency (`package.json`) and already encodes WebP for the thumbnail (`src/assets/service/thumbnail.ts`), so conversion needs no new dependency.

## Change

1. Accept `?format=` on `GET /api/v1/assets/:id/download`. Validate the value against a fixed allowlist (`webp`, `png`, `jpg`) before it reaches sharp — never pass a caller-supplied string to a codec selector. An unknown value is 400, not a silent fallback to the original format.
2. Decrypt first, convert second. For an encrypted asset the stored bytes are a JSON envelope; reuse the decrypt branch already in `handleDownload` (`src/assets/serve-raw.ts`) and convert the plaintext.
3. Set `Content-Type` and the `Content-Disposition` filename extension from the requested format, not from `assets.mime_type`. `handleDownload` currently echoes the sanitized original filename (`src/assets/serve-raw.ts`), which would carry the wrong extension.
4. Guard the alpha loss: JPEG has no alpha. An asset whose `alpha_status` is `native` or `matted` (`src/db/enums-content.ts`) must not be silently flattened to JPEG — 400 unless an explicit background is requested.
5. Do not persist the converted bytes. This is a transport-time transform; a new row would fork the asset and break the `content_hash` idempotency contract (`src/assets/service/create.ts`).
6. Set `Cache-Control` and `Vary` on the response — conversion is per-request CPU.

Scope is `/download` only. `/raw` stays byte-exact.

## Acceptance Criteria

- [ ] `GET /api/v1/assets/:id/download?format=webp` on a PNG asset returns 200, `Content-Type: image/webp`, and a `Content-Disposition` filename ending in `.webp`.
- [ ] `?format=png` and `?format=jpg` each return the matching `Content-Type` and extension.
- [ ] `?format=avif` (or any value outside the allowlist) returns 400 and does not convert.
- [ ] A `chat`-tier encrypted asset with a valid chat context converts from its decrypted plaintext, not from the ciphertext envelope.
- [ ] A `chat`-tier encrypted asset with no chat context returns 400 (unchanged from today).
- [ ] An asset with `alpha_status` `native` or `matted` returns 400 for `?format=jpg`.
- [ ] `?format=` absent returns exactly today's response (same bytes, same `Content-Type`, same filename).
- [ ] The converted bytes are not written to disk and no new `assets` row is created.
- [ ] Tests cover: public PNG → each format; encrypted asset with and without chat context; alpha-bearing asset; invalid format value; absent format.

## Caveats

- **Security / authorization:** the conversion runs after `resolveForServe` has already authorised the request. A converted response must not bypass the asset ACL, the visibility check, or the signed-URL expiry. `?format=` must not become a way to reach bytes the caller could not otherwise read.
- **TOCTOU:** the stored bytes and `assets.mime_type` are read once and used for the conversion. A concurrent re-encrypt or delete must not produce a response built from half of two states — read the bytes, convert, then respond, without re-reading the row.
- **Partial failure:** a sharp decode/encode failure must produce a clean 4xx/5xx, never a truncated body with an image `Content-Type`. Never fall back to serving the original bytes under the requested format's `Content-Type`.
- **Idempotency:** conversion is stateless. The same request must return the same bytes, and must not create an `assets` row, a file on disk, or a job.
- **Observability:** a conversion failure must be logged with the asset id and the requested format, so a client asking for an unsupported source format is diagnosable.
- **Rollback:** the parameter is additive — removing it restores today's behaviour. No schema change, no migration.
- **Stale state:** the source bytes are decrypted per request, so a chat key rotation (see `BUG-rotatekeyonleave-re-encrypts-messages-only-encrypted-assets-.md`) makes the conversion fail exactly as `/raw` fails today. Do not paper over that with a cached rendition.
- **Parallelism / data races:** two concurrent requests for the same asset must not share mutable encoder state; each request gets its own sharp instance.
- **Lock/unlock lifecycle:** no lock is taken. Conversion must not hold a database transaction open while sharp runs.
- **Resource limits:** the decoded image size is bounded by the upload cap already enforced at the trust boundary, but a decompression bomb in a crafted file must not be amplified by the conversion step — keep sharp's default pixel limit in force.
