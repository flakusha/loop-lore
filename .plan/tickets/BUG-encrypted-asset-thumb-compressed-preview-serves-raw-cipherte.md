<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: encrypted asset thumb/compressed preview serves raw ciphertext

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** Re-implemented 2026-10-23. The guard lives in the live handler: `handleServeCompressed` in `src/assets/serve-handlers.ts:209` refuses an encrypted asset with `400 "Encrypted asset preview requires the raw endpoint"` for both `/thumb` and `/compressed`, after the access check and before the variant lookup. The encryption predicate is shared from `src/assets/encryption.ts:28`. The on-disk plaintext-thumbnail half is tracked by `BUG-encrypted-asset-thumbnail-is-stored-and-served-in-plaintext.md`.
**Priority:** medium
**Effort:** Medium

## Resolution

Re-implemented 2026-10-23. The guard is now in the live handler module `src/assets/serve-handlers.ts`: `handleServeCompressed` returns `400 "Encrypted asset preview requires the raw endpoint"` for an encrypted asset, after the access check and before the variant lookup and the raw fallback. The predicate comes from the shared helper `src/assets/encryption.ts` (`isEncryptedAsset`), which `src/assets/serve-raw.ts` (raw + download) and `src/assets/service/read.ts` also use, so the branches cannot drift.

History: an earlier attempt (`fix-batch-vn-assets-fe`, not merged into this tree) added the guard in `src/assets/controller/serve.ts`; that file was later deleted and the guard was not carried over, which is why it was missing from the tree until now.

The policy is **refuse (400)**, not decrypt-then-serve: no caller of `/thumb` or `/compressed` passes a chat context and the asset row carries no recoverable chat id, so the preview path cannot decrypt. Raw `/raw` + `/download` keep their existing decrypt path.

An encrypted asset must never be served as a compressed/thumb variant. The on-disk variant is pre-compressed ciphertext; decrypting it would need raw ciphertext + chat key + re-encode, which is out of scope per plan A4.

## Summary

handleServeCompressed has no decryption branch; a missing variant falls back to serveFile(storage_path), so an encrypted asset renders a broken image. The signed-url route never reads chatId; the raw/download routes do decrypt via chatId+deriveChatKeyForChat. Fix: decryption path or explicit 4xx for encrypted previews.

(The original report cited file-and-line locations in `src/assets/controller/serve.ts`, `upload.ts` and `signed-url-routes.ts`. Those paths were deleted by later refactors; the live equivalents are `src/assets/serve-handlers.ts`, `src/assets/controller.ts` and `src/assets/serve-raw.ts`.)

## Acceptance Criteria

- [x] `GET /api/v1/assets/:id/thumb` and `GET /api/v1/assets/:id/compressed` on a non-public asset return an explicit 4xx, never raw bytes and never the plaintext thumbnail.
- [x] A public-tier asset still serves its compressed/thumb variant with the expected `Content-Type` and bytes.
- [x] The guard lives in the live handler module, and no file it depends on is deleted by a later refactor without the guard moving with it.
- [x] Tests cover the encrypted and public cases.
- [x] The plaintext-thumbnail leak on disk is tracked separately by `BUG-encrypted-asset-thumbnail-is-stored-and-served-in-plaintext.md`.

**Resolved:** 2026-10-23 registry-driven close: git issue ede86bb (registry tip: a4a4ed518 Konstantin Fedotov Auto-closed: ticket BUG-ENCRYPTED-ASSET-THUMB-COMPRESSED-PREVIEW-SERVES)
