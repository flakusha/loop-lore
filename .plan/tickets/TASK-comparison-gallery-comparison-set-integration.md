<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Gallery ↔ comparison-set integration

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** `epic-technical-comparison-charts`
**Related:** `TASK-comparison-grid-frontend.md`, `TASK-comparison-workflow-template-and-command.md`, `epic-frontend-gallery.md`, `epic-asset-platform-capabilities.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Let the gallery open an existing comparison set and filter by it — so a comparison is reachable from
where the user already looks for images, without the gallery needing to understand variants.

## Context

The gallery already filters assets by asset-link entity through one shared query builder:
`applyGalleryAssetFilters` in `src/routes/views/gallery.ts`, called by `serveGalleryGrid`
(`:144`) and `serveGallerySearch` (registered at `/dynamic/gallery/grid` and `/dynamic/gallery/search`
in `src/routes/views/plugin-dynamic.ts:42` and `:69`). The filter takes
`{ actorId, isAdmin, entityType, entityId, tag }` and rejects an `entityType` outside the
`AssetLinkEntity` union (`src/routes/views/gallery.ts:162`).

`AssetLinkEntity` (`src/db/enums-content.ts:73`) is `chat`, `character`, `world`, `actor`, `location`,
`quest`, `item`, `memory`, `message`, `asset` — there is **no comparison entry**. This ticket adds a
`ComparisonSet: "comparison_set"` member so the existing `entityType=comparison_set&entityId=<setId>`
filter path works unchanged. Do not add a bespoke gallery query for comparison; the point is that the
set reuses the shared filter.

Careful with `unlinkAsset`'s ambiguity guard: the `asset_links` PK is
`(asset_id, entity_type, entity_id)`, so deleting a link by `asset_id` + `entity_id` alone over-deletes
when the same id is linked under multiple types (`src/assets/service/links.ts:66-72`). Comparison
outputs are linked under `message`, `chat`, *and* `comparison_set`, so unlinking a comparison must pass
`entityType` explicitly.

Two affordances:

1. **Open a set from the gallery** — a gallery card whose asset has a `comparison_set` link exposes an
   "open in comparison" action that navigates to `/views/comparisons?set=<id>`.
2. **Filter the gallery by set** — `entityType=comparison_set&entityId=<setId>` already works once the
   enum entry lands; expose it as a link from the comparison grid ("show these in the gallery").

Do not add comparison awareness to the gallery's own card renderer beyond that one affordance — the
gallery stays an asset list. Partial/view idiom to copy: `src/partials/gallery/preview-modal.html` and
`src/frontend/components/asset-preview-modal.ts`.

## Acceptance Criteria

- [ ] `AssetLinkEntity` in `src/db/enums-content.ts:73` gains a `ComparisonSet: "comparison_set"` member, and the regenerated types still pass `bun run schemas:check`
- [ ] `GET /dynamic/gallery/grid?entityType=comparison_set&entityId=<setId>` returns exactly that set's outputs, through the shared `applyGalleryAssetFilters` path with no comparison-specific query
- [ ] An unknown `entityType` still returns the existing "Invalid entity type" card (`src/routes/views/gallery.ts:166`) — the new value does not weaken that guard
- [ ] A gallery card with a `comparison_set` link renders an "open in comparison" affordance linking to `/views/comparisons?set=<id>`
- [ ] The comparison grid has a "show these in the gallery" action that produces the `entityType=comparison_set` filter link
- [ ] Unlinking a comparison output passes `entityType` explicitly and does not trip the ambiguity guard at `src/assets/service/links.ts:66` (proved by a test that links the same asset under three types)
- [ ] `src/routes/views/gallery.test.ts` gains cases for the new enum value, the filter result, and the unchanged invalid-type guard
