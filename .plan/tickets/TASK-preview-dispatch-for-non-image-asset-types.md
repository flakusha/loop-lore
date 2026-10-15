<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Preview dispatch for non-image asset types

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-asset-platform-capabilities

**Summary:**

Extend asset preview generation beyond images: video keyframes, PDF first page, 3D render — dispatched on mime type with the existing best-effort null fallback.

**Context:**

Verified 2026-10-15: `src/assets/service/thumbnail.ts` — `THUMBNAIL_MAX_DIM = 256`, `THUMBNAIL_WEBP_QUALITY = 85`, `sharp` only, best-effort. A decode/encode failure returns `null` and `handleServeCompressed` falls back to the raw bytes, so a missing thumb never breaks the request. That contract is correct and must be preserved.

Gap: the schema and the epic plans admit video (`duration_secs`), 3D and PDF, and **none of them have a preview path**. The gallery silently ships raw-bytes fallbacks for every non-image modality.

**Blocking unknown — resolve before implementation:** whether the repo already vendors an ffmpeg-capable dependency for video keyframes, and which PDF rasterizer (if any) is already present. Not yet checked; the ticket must not start until it is.

**Acceptance Criteria:**

- [ ] **Behaviour:** preview generation dispatches on mime type; the image path output is unchanged (256px max, WebP q85).
- [ ] **Behaviour:** each supported non-image family produces a stored preview; unsupported or malformed input returns `null` and the serve path falls back to raw bytes, exactly as today.
- [ ] **Tests:** one real fixture per family; malformed input per family; truncated file.
- [ ] **Edge cases:** zero-byte file; declared mime disagrees with magic bytes (a PDF named `.png`); video shorter than one frame; an encrypted-tier asset; concurrent preview writes for the same asset id.
- [ ] **Concurrency / TOCTOU:** preview writes are atomic (temp + rename) so a concurrent serve never reads a half-written preview.
- [ ] **Security:** preview output re-uses the asset's encryption tier and key — never a plaintext path; the preview path is derived from the asset id, **never** from the client-supplied filename (path traversal).
- [ ] **Regressions:** existing thumbnail tests and serve path unchanged.
- [ ] **Repo gates:** `bun run check` green; the blocking dependency question above answered before implementation starts.
