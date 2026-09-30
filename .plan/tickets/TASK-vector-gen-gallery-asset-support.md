<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Vector-gen gallery asset support

**Summary:** Gallery render path for sanitized-SVG + animated vector kinds
**Context:** Vector-graphics epic; follows TASK-vector-gen-svg-serve-safety sanitized-SVG kind
**Acceptance Criteria:** See ## Acceptance Criteria below

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Extend type detection and gallery/preview/thumbnail render paths for the two
new vector kinds (sanitized SVG, animated vector). Detection: extend
`detectAssetType` + `mimeFromExtension` in `src/assets/service/detect.ts` for
the sanitized-SVG kind. Gallery sidebar: extend render path in
gallery-sidebar.html + `src/frontend/alpine/chat-utils/gallery.ts` — inline
`<img>` for sanitized SVG, first-frame thumb for animated. Preview modal:
extend `renderPreviewBody` switch in `src/frontend/asset-preview.ts`.
Thumbnails: animated-poster path in `src/assets/service/thumbnail.ts` — first
frame, reusing the `writeThumbnail` pattern and the video/ gate pattern
(cf. create.ts:128-134).
AssetType enum (`src/db/enums-content.ts`) gets no animated split; migration
note recorded append-only as a new `NNN_` file.

## Acceptance Criteria

- [ ] `detectAssetType` returns Image for sanitized-SVG uploads; `mimeFromExtension` maps `.svg` to the sanitized kind (upload `.svg`, check stored `mime_type`)
- [ ] Gallery sidebar shows sanitized SVG inline as `<img>` and animated vector as first-frame thumb (open gallery with one of each, both tiles render, no broken image)
- [ ] Preview modal renders both kinds without falling to the unknown-type branch (click each tile, modal shows content)
- [ ] Animated upload persists a first-frame poster thumbnail via the thumbnail service (upload animated vector, `thumbnail_path` set, thumb loads)
- [ ] No animated split in `src/db/enums-content.ts` `AssetType` enum; migration note recorded append-only as a new `NNN_` file (upload sanitized-SVG + animated vector with no AssetType enum change and no edit to landed migration files; new kind resolves through existing Image/Video mapping)
