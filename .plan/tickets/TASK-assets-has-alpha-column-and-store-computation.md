<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: assets.has_alpha column and store computation

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (already on dev, 2026-09-19)
**Priority:** medium
**Effort:** Medium
**Epic:** Avatar Alpha Channel + VN Layering

## Summary

Detection at store (png rgba vs rgb, webp vp8l) + regen artifacts. Part of epic Avatar Alpha Channel + VN Layering.

## Resolution

Detection at store landed on dev (same pipeline, 2f9e64967); verified
2026-09-19 against current dev (b8debaf99):

- `src/assets/alpha-detect.ts` — header-only alpha detection: PNG color type
  4/6 + tRNS chunk, WebP VP8X ALPH flag / VP8L, GIF transparency; JPEG = no
  alpha
- `src/assets/metadata.ts:236-258` — `extractImageMetadata` returns
  `hasAlpha` per format
- `src/assets/service/create.ts:117` — store-time computation via
  `initialAlphaStatus(mimeType, hasAlpha)` (`alpha-status.ts:33`)
- Schema divergence: shipped as the richer `assets.alpha_status` enum
  (`unknown | raw | native | matting_pending | matted | matting_failed`,
  `src/db/enums-content.ts`) instead of a boolean `has_alpha` column — native
  detection, matting state, and re-run semantics all need more than a boolean
- Covered by `src/assets/alpha-detect.test.ts` (png rgba/rgb, webp vp8l/vp8,
  tRNS precedence) and the `initialAlphaStatus` path in create tests

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
