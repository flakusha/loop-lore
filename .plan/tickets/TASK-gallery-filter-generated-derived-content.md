<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Gallery filter for generated and derived content

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** derived-map-generation
**Tags:** gallery, frontend, filters
**Depends on:** `TASK-derived-map-origin-links`
**Related:** epic-frontend-gallery.md, epic-gallery-batch-operations.md

**Summary:**

Add `kind` (uploaded / generated / derived) filtering to the gallery grid and search, and populate the provenance line in the asset preview modal.

**Context:**

`applyGalleryAssetFilters` (`src/routes/views/gallery.ts:36`) filters by entityType/entityId/tag; `serveGallerySearch` (`src/routes/views/search.ts:19`) adds `type`/`q`/`sort`. Nothing distinguishes an uploaded photo from a generated asset or a depth-map derivative. The preview modal's `source` slot (`src/components/asset-preview-modal.html:102-104`) exists but is never populated.

**Acceptance Criteria:**

- [ ] `kind` filter on grid + search, from a closed set (`uploaded` / `generated` / `derived`, `all` default); realized in `applyGalleryAssetFilters` so grid and search cannot drift
- [ ] `derived` resolves via origin links (`TASK-derived-map-origin-links`): assets that are derivatives of another asset the viewer can see
- [ ] New query params validated at the boundary by the shared query-param validation layer (closed set, no inline allow-list), unknown value → 400 fast-fail before any query
- [ ] Preview modal shows the origin ("derived from <filename>") via the read API; missing origin renders nothing, never a broken row
- [ ] Test: grid route with `kind=derived` excludes uploads; search with an invalid `kind` returns 400; preview renders origin for a linked derivative and omits it for a root asset
- [ ] `bun run check` green

## Technical Notes

- "generated" classification (provenance ledger or a lineage flag) may need the asset-platform batch; if `generated` cannot be determined exactly, ship `derived` + `uploaded` and record the gap — do not guess.
- Filter values are a fixed set — validate like other closed-set query params, not free text.

git issue: 0da0985
