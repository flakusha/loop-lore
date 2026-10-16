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
`applyGalleryAssetFilters` in `src/routes/views/gallery.ts:36`, called by `serveGalleryGrid`
(`:144`) and by `serveGallerySearch` (`src/routes/views/search.ts:19`, registered at
`/dynamic/gallery/grid` and `/dynamic/gallery/search` in
`src/routes/views/plugin-dynamic.ts:42` and `:76`). The builder takes
`{ actorId, isAdmin, entityType, entityId, tag }` and applies them; it does **not** validate
`entityType`. The `entityType`-outside-the-`AssetLinkEntity` guard lives one level up, in
`serveGalleryGrid` itself (`src/routes/views/gallery.ts:162-167`), and `serveGallerySearch` has no
equivalent guard today — so the "invalid entity type" rejection this ticket must not weaken applies to
the grid endpoint only.

`AssetLinkEntity` (`src/db/enums-content.ts:73`) is `chat`, `character`, `world`, `actor`, `location`,
`quest`, `item`, `memory`, `message`, `asset` — there is **no comparison entry**. This ticket adds a
`ComparisonSet: "comparison_set"` member so the existing `entityType=comparison_set&entityId=<setId>`
filter path works unchanged. Do not add a bespoke gallery query for comparison; the point is that the
set reuses the shared filter.

Careful with `deleteAssetLink`'s ambiguity guard: the `asset_links` PK is
`(asset_id, entity_type, entity_id)`, so resolving a link by `asset_id` + `entity_id` alone is ambiguous
when the same id is linked under multiple types. `deleteAssetLink` refuses that case outright
(`src/assets/service/links.ts:92-99`, with the reasoning at `:64-71`). `unlinkAsset`
(`src/assets/service/links.ts:50`) already takes `entityType` and **has no ambiguity guard** — it
deletes whatever matches, which is exactly why comparison code must not reach for it by id alone.
Comparison outputs are linked under `message`, `chat`, *and* `comparison_set`, so unlinking a
comparison must pass `entityType` explicitly.

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
- [ ] An unknown `entityType` still returns the existing "Invalid entity type" card from the guard in `serveGalleryGrid` (`src/routes/views/gallery.ts:162-166`) — the new value does not weaken that guard
- [ ] A gallery card with a `comparison_set` link renders an "open in comparison" affordance linking to `/views/comparisons?set=<id>`
- [ ] The comparison grid has a "show these in the gallery" action that produces the `entityType=comparison_set` filter link
- [ ] Unlinking a comparison output passes `entityType` explicitly and does not trip the ambiguity guard in `deleteAssetLink` (`src/assets/service/links.ts:92-99`) (proved by a test that links the same asset under three types)
- [ ] `src/routes/views/gallery.test.ts` gains cases for the new enum value, the filter result, and the unchanged invalid-type guard
