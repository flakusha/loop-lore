<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: encrypted asset thumb/compressed preview serves raw ciphertext

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** Reopened 2026-10-23 — the fix described below is **not in the tree**. The guard was added in `398651b4d` (`src/assets/controller/serve.ts`) and silently dropped when `ff0e518c6` (2026-09-11) deleted that file and re-implemented the handlers inline in `src/assets/controller.ts`; `6b7e5bcc5` then moved them to `src/assets/serve-handlers.ts`. `grep "Encrypted asset preview requires the raw endpoint" src/` returns no matches, and a runtime probe confirms `GET /api/v1/assets/:id/thumb` on a `chat`-tier asset returns 200 with plaintext WebP and no chat context. The plaintext-thumbnail dimension of the defect is tracked by `BUG-encrypted-asset-thumbnail-is-stored-and-served-in-plaintext.md`; this ticket owns the serve-path guard.
**Priority:** medium
**Effort:** Medium

## Resolution

Never landed. An earlier attempt (`fix-batch-vn-assets-fe`, not merged into this tree) added the guard in `src/assets/controller/serve.ts`: `handleServeCompressed` would return an explicit `400 "Encrypted asset preview requires the raw endpoint"` when `asset.encryption_tier !== "public" && asset.encrypted_key_id` — before the compressed-path/fallback logic. That file was deleted by a later refactor and the guard was not carried over, so neither the guard nor its route test (`src/assets/controller/serve-policy.routes.test.ts`) exists in the tree today.

The intended behaviour still stands: an encrypted asset must never be served as a compressed/thumb variant. The on-disk variant is pre-compressed ciphertext; decrypting it would need raw ciphertext + chat key + re-encode, which is out of scope per plan A4. Raw `/raw` + `/download` endpoints keep their existing decrypt path.

## Summary

handleServeCompressed has no decryption branch; a missing variant falls back to serveFile(storage_path), so an encrypted asset renders a broken image. The signed-url route never reads chatId; the raw/download routes do decrypt via chatId+deriveChatKeyForChat. Fix: decryption path or explicit 4xx for encrypted previews.

(The original report cited file-and-line locations in `src/assets/controller/serve.ts`, `upload.ts` and `signed-url-routes.ts`. Those paths were deleted by later refactors; the live equivalents are `src/assets/serve-handlers.ts`, `src/assets/controller.ts` and `src/assets/serve-raw.ts`.)

## Acceptance Criteria

- [ ] `GET /api/v1/assets/:id/thumb` and `GET /api/v1/assets/:id/compressed` on a non-public asset return an explicit 4xx, never raw bytes and never the plaintext thumbnail.
- [ ] A public-tier asset still serves its compressed/thumb variant with the expected `Content-Type` and bytes.
- [ ] The guard lives in the live handler module, and no file it depends on is deleted by a later refactor without the guard moving with it.
- [ ] Tests cover the encrypted and public cases.
- [ ] The plaintext-thumbnail leak on disk is tracked separately by `BUG-encrypted-asset-thumbnail-is-stored-and-served-in-plaintext.md`.

**Resolved:** 2026-10-23 registry-driven close: git issue ede86bb (registry tip: a4a4ed518 Konstantin Fedotov Auto-closed: ticket BUG-ENCRYPTED-ASSET-THUMB-COMPRESSED-PREVIEW-SERVES)
