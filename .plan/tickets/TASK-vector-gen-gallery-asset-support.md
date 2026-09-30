<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Vector-gen gallery asset support

**Summary:** Gallery render path for sanitized-SVG plus animated-raster poster thumbs
**Context:** Vector-graphics epic; follows TASK-vector-gen-svg-serve-safety sanitized-SVG kind
**Acceptance Criteria:** See ## Acceptance Criteria below
**Epic:** epic-vector-graphics-generation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Two concrete render tracks. Track (a) — sanitized-SVG render path: inline `<img>` via `/raw`, poster via `/thumb`; upload gate is validate.ts block + TASK-vector-gen-svg-serve-safety sanitizer as prerequisite. Gallery sidebar extends in gallery-sidebar.html + `src/frontend/alpine/chat-utils/gallery.ts`; preview modal extends `renderPreviewBody` in `src/frontend/asset-preview.ts`. Track (b) — animated-RASTER poster thumbs: consumer of TASK-vector-gen-animated-raster; first-frame still via writeThumbnail pattern and create.ts image/ gate pattern (cf. create.ts:128-134). `mimeFromExtension` already maps .svg→image/svg+xml (detect.ts:27): upload gate enforced as .svg rejected while raw image/svg+xml blocked; accepted once sanitizer-stamped (upload probe .svg, check stored mime_type). AssetType enum (`src/db/enums-content.ts`) gets no animated split; migration note recorded append-only as a new NNN_ file.

## Acceptance Criteria

- [ ] Sanitized SVG upload passes: `.svg` rejected while raw image/svg+xml blocked; accepted once sanitizer-stamped (upload probe `.svg`, check stored `mime_type`)
- [ ] Gallery sidebar shows sanitized SVG inline as `<img>` and animated raster as first-frame thumb (open gallery with one of each, both tiles render, no broken image)
- [ ] Preview modal renders both kinds without falling to the unknown-type branch (click each tile, modal shows content)
- [ ] Animated raster upload persists a first-frame poster thumbnail via the thumbnail service (upload animated raster, `thumbnail_path` set, thumb loads)
- [ ] No animated split in `src/db/enums-content.ts` `AssetType` enum; migration note recorded append-only as a new `NNN_` file (upload sanitized-SVG + animated raster with no AssetType enum change and no edit to landed migration files; new kind resolves through existing Image/Video mapping)


git issue: 47dd28f
