<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Encrypted asset thumbnail is stored and served in plaintext

**Status:** Done
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
status:        Done
content-type:  image/webp
body bytes:    162
body is RIFF/WEBP: true
--- /raw (no chat context) ---
status:        Done
```

`/raw` correctly refuses. `/thumb` serves the plaintext picture.

## Context

Research note: `docs/meta/research/webp-first-class-storage.md` (finding F1).

`src/assets/service/create.ts:120` generates the thumbnail from `input.buffer` — the plaintext image — and `writeThumbnail` (`src/assets/service/thumbnail.ts:54`) writes it to `compressed/<aa>/<bb>/<assetId>_thumb.webp` unencrypted, next to the encrypted primary file.

`handleServeCompressed` (`src/assets/serve-handlers.ts:179`) had no encryption branch, so it served that plaintext derivative to anyone who passes the asset ACL. The thumbnail is a real, if reduced, picture of the secret image.

A guard for the compressed/thumb path existed once and was lost — see `BUG-encrypted-asset-thumb-compressed-preview-serves-raw-cipherte.md`. That guard has now been re-implemented in the live handler (`src/assets/serve-handlers.ts:209`); this ticket is the strictly new part of that defect: the lost guard was written against a *ciphertext* preview, whereas the thumbnail on disk is *plaintext*.

## Change

**Policy: 400 (refuse).** The encrypted-preview policy for `GET /assets/:id/thumb` and `GET /assets/:id/compressed` is to refuse with `400 "Encrypted asset preview requires the raw endpoint"`, matching what `/raw` does without a chat context.

Decrypt-then-serve was considered and is **not implementable today**: no caller of the preview endpoints passes a chat id, the routes read only the signed-url query params (`sig`, `expires`) and forward no chat context, and the asset row carries `encrypted_key_id` (a `chat_keys.id`) rather than a chat id, so the chat key cannot be recovered from the row. Decrypt-then-derive is therefore deferred until a caller exists AND the chat context is plumbed through; the raw endpoint remains the encrypted-aware read path.

Implemented:

1. **Shared predicate.** One helper, `isEncryptedAsset` (`src/assets/encryption.ts:28`), is the single "is this asset encrypted?" test. It replaces the duplicated inline predicates in `src/assets/serve-raw.ts:64` (raw) and `src/assets/serve-raw.ts:136` (download) and the one in `src/assets/service/read.ts:75`, so the serve paths and the write path cannot drift apart.
2. **Serve-path guard.** `handleServeCompressed` (`src/assets/serve-handlers.ts:209`) refuses an encrypted asset with the 400 above, AFTER the access check (`resolveForServe` / `resolveAsset`) and BEFORE the variant lookup and the raw fallback — so the guard is not an existence oracle for a caller who cannot read the asset. One handler serves both `/thumb` and `/compressed`, so the single guard covers both. The refusal is logged via the structured logger (`getLog()?.warn`).
3. **No plaintext thumbnail on disk.** `createAsset` (`src/assets/service/create.ts:118`) skips thumbnail generation entirely when the row it is about to persist is encrypted, so no new plaintext derivative is written. Public assets keep their thumbnails unchanged. The best-effort contract is unchanged: a thumbnail failure leaves `thumbnail_path` null.
4. **Thumbnail removed on delete.** `deleteAsset` (`src/assets/service/delete.ts:109`) now unlinks `asset.thumbnail_path` as well as `asset.storage_path`, with the same warn-on-failure style — a failed unlink does not fail the delete.

**Remaining gap (honest statement, no backfill migration included):** assets encrypted BEFORE this fix may still have a plaintext thumbnail file on disk. The serve path refuses those assets (the guard reads the row, not the file), and no new plaintext thumbnail is written, so the leak is closed at the read path and at the write path — but the stale files are not deleted retroactively. No backfill migration is included because there is no production path that creates an encrypted image asset today: the only encrypted asset produced by production code is a voice note (audio, no thumbnail), and the encryption tier is set to `standard` only when a chat key was derived for the upload (`src/assets/controller.ts:582`). A backfill can be added when an encrypted image path ships; it would be a one-shot sweep of `compressed/` files whose asset row is encrypted.

Stale file citations from the original report (`src/assets/controller/serve.ts`, `upload.ts`, `signed-url-routes.ts`) refer to files deleted by later refactors. The live paths are `src/assets/serve-handlers.ts`, `src/assets/controller.ts`, `src/assets/serve-raw.ts`, `src/assets/encryption.ts`, `src/assets/service/create.ts`, `src/assets/service/thumbnail.ts`, `src/assets/service/delete.ts` and `src/assets/variant-path.ts`.

## Acceptance Criteria

- [x] `GET /api/v1/assets/:id/thumb` on a `chat`-tier asset with no chat context does not return plaintext image bytes.
- [x] `GET /api/v1/assets/:id/thumb` on a `chat`-tier asset with no chat context returns 400, or returns a thumbnail derived from the decrypted blob — whichever policy is chosen, and the choice is recorded on this ticket.
- [x] The thumbnail file of an encrypted asset is not readable as a plaintext image on disk. (No NEW plaintext thumbnail is written for an encrypted asset; assets encrypted before the fix may still have one — see the remaining-gap note in `## Change`.)
- [x] A public-tier asset still gets its thumbnail, and `GET /assets/:id/thumb` still serves it as `image/webp`.
- [x] An asset whose `thumbnail_path` is null still falls back to the raw bytes for a public asset (the existing best-effort contract, `src/assets/service/thumbnail.ts`).
- [x] Tests cover: encrypted asset thumb without chat context; encrypted asset thumb with chat context; public asset thumb; encrypted asset with no thumbnail file. The "with chat context" case is covered by the same 400 assertion: the preview endpoints accept no chat context at all, so the refusal does not depend on it. Tests live in `src/assets/serve-handlers.encrypted.test.ts`.

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
<<<<<<< ours — heading `Caveats` (T+F, confidence: medium)
// hint: Logic and cosmetic changes overlap. Resolve logic first, then reformat.

**Resolved:** 2026-10-23 registry-driven close: git issue 312e077 (registry tip: 594626fda Konstantin Fedotov Auto-closed: appended .md marker marks BUG-ENCRYPTED-ASSET-THUMBNAIL-IS)
=======
**Resolved:** 2026-10-23 implementation landed in the branch worktree (not yet committed): shared `isEncryptedAsset` predicate, preview guard (400) in `src/assets/serve-handlers.ts`, no plaintext thumbnail written for an encrypted asset, thumbnail unlinked on delete. The linked git issue stays open until the branch is merged.
>>>>>>> theirs — heading `Caveats` (T+F, confidence: medium)
