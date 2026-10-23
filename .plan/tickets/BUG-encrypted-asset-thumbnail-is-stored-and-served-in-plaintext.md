<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Encrypted asset thumbnail is stored and served in plaintext

**Status:** Not Started
**Priority:** critical
**Effort:** Medium
**Epic:** epic-asset-platform-capabilities
**Tags:** assets, security
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The 256px thumbnail of an encrypted asset is generated from the **plaintext** image and written to disk unencrypted, then served over `GET /api/v1/assets/:id/thumb` with no chat key and no chat context. The raw blob in the same row is correctly encrypted and correctly refuses to serve without a chat key — the thumbnail does not.

Executed behaviour (encrypted `chat`-tier asset, no chat context):

```text
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

## Context

Research note: `docs/meta/research/webp-first-class-storage.md` (finding F1).

`src/assets/service/create.ts` generates the thumbnail from `input.buffer` — the plaintext image — and `writeThumbnail` (`src/assets/service/thumbnail.ts`) writes it to `compressed/<aa>/<bb>/<assetId>_thumb.webp` unencrypted, next to the encrypted primary file.

`handleServeCompressed` (`src/assets/serve-handlers.ts`) has no encryption branch, so it serves that plaintext derivative to anyone who passes the asset ACL. The thumbnail is a real, if reduced, picture of the secret image.

A guard for the compressed/thumb path existed once and was lost — see `BUG-encrypted-asset-thumb-compressed-preview-serves-raw-cipherte.md`, which is marked `Done` but whose described code is not in the tree. This ticket is the strictly new part of that defect: the guard was written against a *ciphertext* preview, whereas the thumbnail on disk is *plaintext*.

## Change

1. Decide and implement the encrypted-preview policy for `GET /assets/:id/thumb`. Two options, and the choice must be made explicitly rather than inherited from a lost commit:
   - **400** — refuse the preview for an encrypted asset, matching what `/raw` does without a chat context, and matching the guard that was dropped; or
   - **decrypt-then-derive** — decrypt the raw blob with the chat key, then generate the thumbnail per request. Correct, but it is per-request CPU on a hot path.
   The 400 option is the smaller change and is the one the dropped guard implemented. Prefer it unless there is a caller that needs an encrypted preview.

2. Stop writing the plaintext thumbnail to disk for an encrypted asset. `writeThumbnail` is called with the plaintext buffer before the encryption decision is visible to it; either skip thumbnail generation for a non-public tier, or encrypt the thumbnail the way the primary blob is encrypted.
3. If the thumbnail is encrypted on disk, `resolveCompressedVariantPath` (`src/assets/variant-path.ts`) must decrypt it before serving, and the serve path must be gated the same way `/raw` is.
4. Delete the plaintext thumbnail file of any asset that is encrypted, if a migration is needed to clean up existing rows. Note that `TASK-asset-emotion-job-hygiene-orphaned-thumbnails-stuck-running-.md` already records that `src/assets/service/delete.ts` deletes only `asset.storage_path` and never `assets.thumbnail_path` — orphaned thumbnails are already a known leak of disk space, and this widens it to a leak of plaintext.

## Acceptance Criteria

- [ ] `GET /api/v1/assets/:id/thumb` on a `chat`-tier asset with no chat context does not return plaintext image bytes.
- [ ] `GET /api/v1/assets/:id/thumb` on a `chat`-tier asset with no chat context returns 400, or returns a thumbnail derived from the decrypted blob — whichever policy is chosen, and the choice is recorded on this ticket.
- [ ] The thumbnail file of an encrypted asset is not readable as a plaintext image on disk.
- [ ] A public-tier asset still gets its thumbnail, and `GET /assets/:id/thumb` still serves it as `image/webp`.
- [ ] An asset whose `thumbnail_path` is null still falls back to the raw bytes for a public asset (the existing best-effort contract, `src/assets/service/thumbnail.ts`).
- [ ] Tests cover: encrypted asset thumb without chat context; encrypted asset thumb with chat context; public asset thumb; encrypted asset with no thumbnail file.

## Caveats

- **Security:** this is a confidentiality defect. The thumbnail is a lossy but genuine derivative of the secret image. A fix that only guards the serve path while leaving the plaintext file on disk is incomplete — both halves are in scope.
- **Authorization:** the serve guard must not become a way to distinguish 'asset exists' from 'asset is encrypted' for a caller who cannot read the asset. The response for an encrypted preview should not leak more than the asset ACL already permits.
- **TOCTOU:** the thumbnail path and the encryption tier are read from the row once. A concurrent re-encrypt or key rotation must not leave a plaintext thumbnail reachable through a stale path.
- **Partial failure:** if the thumbnail is written but the row insert fails, the orphan file must not persist as a plaintext derivative.
- **Rollback:** the policy is a single branch. Reverting must not re-enable plaintext serving for encrypted assets — the fix is a security fix, and a rollback of it is itself a security regression.
- **Stale state:** assets encrypted before the fix already have a plaintext thumbnail on disk. The fix must state whether existing rows are cleaned up or left alone; leaving them alone is only acceptable if the serve path refuses them.
- **Idempotency:** re-running the cleanup (if a migration is added) must be safe to run twice.
- **Observability:** a refused encrypted preview must be logged, so a client that depends on previews gets a diagnosable signal rather than a silent blank.
- **Parallelism / data races:** two concurrent requests for the same encrypted asset's thumbnail must not race on a shared derived file.
- **Lock/unlock lifecycle:** no lock is taken. If a cleanup migration rewrites files, it must not hold a transaction open across file IO.
- **Resource limits:** the serve path must not trust a persisted `thumbnail_path` that escapes the upload root. `resolveCompressedVariantPath` already skips such a candidate (`src/assets/variant-path.ts`); keep that behaviour.
