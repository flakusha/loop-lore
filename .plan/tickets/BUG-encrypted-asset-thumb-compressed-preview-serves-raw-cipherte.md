<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: encrypted asset thumb/compressed preview serves raw ciphertext

**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Medium

## Resolution

Fixed in `fix-batch-vn-assets-fe` (commit pending): `src/assets/controller/serve.ts` `handleServeCompressed` now returns explicit `400 "Encrypted asset preview requires the raw endpoint"` when `asset.encryption_tier !== "public" && asset.encrypted_key_id` — before the compressed-path/fallback logic. Encrypted assets can never be served as a compressed/thumb variant (the on-disk variant is pre-compressed ciphertext; decrypting requires raw ciphertext + chat key + re-encode, out of scope per plan A4). Raw `/raw` + `/download` endpoints keep their existing decrypt path.

Test: `src/assets/controller/serve-policy.routes.test.ts` — "encrypted asset compressed variant: 400 (never raw ciphertext)" (asserts 400 + message) and "public asset compressed variant: serves webp when variant exists" (asserts 200 + `image/webp` + exact bytes). 15/15 pass in worktree, typecheck EXIT=0, dprint clean.

## Summary

src/assets/controller/serve.ts:188-225 handleServeCompressed has no decryption branch; missing variant falls back to serveFile(storage_path) -> encrypted tier 'standard' (upload.ts:69-87) renders broken images; signed-url-routes.ts:112-128 never reads chatId; raw/download routes do decrypt via chatId+deriveChatKeyForChat (serve.ts:139-164,268-293). Fix: decryption path or explicit 4xx for encrypted previews.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
