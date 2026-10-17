<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui gallery surface: grid, filters, thumbnails, upload

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-experimental-egui-frontend

**Summary:**

Bring the asset gallery to the egui client at parity with the htmx page.

Today (htmx): GET /views/gallery renders src/views/gallery.html — the grid loads
via hx-get="/dynamic/gallery/grid" (gallery.html:51), the filter bar
(partials/filter-bar.html) debounces into hx-get="/dynamic/gallery/search"
(300ms), and the upload modal comes from /partials/gallery/upload-modal. The
dynamic endpoints live in src/routes/views/plugin-dynamic.ts (gallery grid at
:42, search at :69); handlers are serveGalleryGrid
(src/routes/views/gallery.ts:144) and serveGallerySearch
(src/routes/views/search.ts:19), both applying the shared visibility filter
(applyGalleryAssetFilters, src/routes/views/gallery.ts:36). Chat-side gallery
state (upload, batch select, attach) is src/frontend/alpine/chat-utils/gallery.ts.
The REST API is already client-agnostic: GET /api/assets (paginated list) and
POST /api/assets (upload) at src/assets/controller.ts:13, GET
/api/assets/:id/thumb at :17, plus batch-download / batch-delete / tag endpoints.

egui target: a scrolling texture grid fed by GET /api/assets with the same
visibility filter, thumbnails via GET /api/assets/:id/thumb, upload through the
same POST, and attach-to-chat parity. Image/texture loading in wasm goes
through egui's loader seam (egui::load / TextureLoader,
https://docs.rs/egui/latest/egui/load/index.html) backed by the JS bridge's
fetch — Rust does not own a second HTTP path.

**Context:**

Parity target #5 of the egui roadmap in `epic-experimental-egui-frontend.md`
(2026-10-16). The gallery is the most fragment-heavy surface in the htmx app
(`src/views/gallery.html` plus four `/dynamic/gallery/*` handlers), which makes it
the strongest test of the decision-update rule: JSON communication, not fragment
scraping. Two existing seams carry it: the REST shape
(`GET /api/assets` → `/api/assets/:id/thumb`, POST `/api/assets`) and the
grid-filters view-model conventions from `TASK-json-view-models-for-gallery-and-chat-list-endpoints-egui-cl.md`.
Alternative considered — reading the htmx grid's DOM from wasm — is rejected:
swap targets deliberately exclude any canvas container, so the canvas is not in
the DOM egui could scrape, and scraping would fork the grid layout.

**Acceptance Criteria:**

- [ ] Grid shows the same asset set and order the htmx page shows for the same
      filters (one visibility filter, applied server-side)
- [ ] Thumbnails load through the bridge fetch + egui texture seam;
      missing/failed images degrade to a placeholder tile, never a panic or a
      blank grid
- [ ] Upload (`POST /api/assets`) and attach-to-chat work from egui with the
      same responses the htmx forms produce
- [ ] Paging uses the same `pageSize`/cursor contract as `GET /api/assets`
- [ ] Tests passing; roadmap row in the epic marked delivered
