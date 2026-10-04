<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Asset B1 — rendition pipeline (`asset_renditions` + thumbs/LQIP)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** `epic-asset-platform-capabilities` (Batch B1)
**Related:** `TASK-asset-b1-blake3-content-store.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Add the `asset_renditions(asset_id, kind, path, width, height, bytes)` table
and the thumb/LQIP pipeline (sharp, in-process) so gallery + chat bubbles
never load original bytes. Extends the existing single-thumbnail path, which
stays as the `thumb_s` producer.

## Context

Ground state: `generateThumbnail` resizes to 256px-max WebP quality 85 via
sharp (`src/assets/service/thumbnail.ts:35-40`), persisted to
`assets.thumbnail_path` (`src/db/schema-content.ts:58`) under
`compressed/<sub>/<id>_thumb.webp` (`thumbnail.ts:53-63`); serve prefers it
(`src/assets/variant-path.ts:9-11`, `handleServeCompressed` falls back to raw
when null). Non-images get no thumb (`thumbnail.test.ts:102-103`). Gallery
renders full-size blobs at 4:3 cards (epic § Current State) — no ladder.
No `asset_renditions` table; no LQIP/blurred-placeholder, `thumb_l`,
video-poster, or `baked` kinds. EXIF/GPS strip path does not exist (B1 scope
includes it: keep original for own gallery, serve stripped derivative to
other users; no `has_location` extraction in `src/assets/metadata.ts`).
Rendition rows inherit refcount from the parent blob
(`TASK-asset-b1-blake3-content-store.md`).

## Acceptance Criteria

- [ ] `asset_renditions(asset_id, kind, path, width, height, bytes)` table
  (forward migration); kinds `thumb_s | thumb_l | lqip | poster | baked`;
  existing `thumbnail_path` rows backfill as `thumb_s`
- [ ] Pipeline: sharp in-process (256px `thumb_s`, larger `thumb_l`, blurred
  `lqip` placeholder); best-effort — failure leaves rendition absent and
  serve falls back (thumbnail.ts precedent); video `poster` frame when a
  video provider lands, stub 501 until then
- [ ] Gallery + chat image bubbles load thumbs with LQIP progressive swap;
  original bytes never served for grid/bubble views (prove via test —
  request grid, assert no raw-asset serve)
- [ ] EXIF/GPS strip on the external-serve boundary: stripped derivative to
other users, original kept for own gallery metadata view
- [ ] Rendition lifecycle: parent delete removes rendition rows + files
  (deleteAsset derivative-GC shape); unit tests per epic Work Items
  (determinism where applicable)
