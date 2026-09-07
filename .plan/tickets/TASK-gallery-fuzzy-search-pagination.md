<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Gallery Fuzzy Search + Pagination + Backend Sort/Relevance

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Task
**Tags:** gallery, fuzzy, search, pagination, relevance, backend-sort, frontend
**Epic:** epic-frontend-gallery.md (Phase 3 Polish)

## Summary

Replace the client-side `globalThis.filterAssets` LIKE-substring filter (`src/frontend/pages/gallery.ts`) with a backend fuzzy search + relevance ranking + paginated endpoint. Compose with `TASK-search-service-unified.md` so gallery search routes through the unified service and benefits from FTS5, vector, hybrid, and 3-tier time caps.

## Why this task exists (the gap)

`src/frontend/pages/gallery.ts:11` does client-side substring filtering with no relevance ranking, no pagination, no time caps, no fuzzy/typo tolerance, and no backend authority. The frontend can search a few hundred assets acceptably; thousands break the browser. The user explicitly asked for backend sort/relevance ranking OR direct result dump with pagination.

## Design

### Backend endpoint — extend existing

```ts
// src/routes/views.ts (or dedicated src/routes/gallery-search.ts)
GET /api/assets/search
  ?q=<query>            // fuzzy / hybrid
  &type=<image|audio|video|all>
  &entity_type=<actor|chat|...>
  &entity_id=<id>
  &tag=<tag>
  &visibility=<public|private|nsfw>
  &sort=<relevance|created_desc|name_asc|size_desc>
  &limit=<1..100>       // default 24
  &offset=<0..N>
```

Calls `unifiedSearch.search({ mode: "hybrid", q, topK: limit, filters: { type, entityType, entityId, tag, visibility } })` against `{ kind: "assets", userId, visibility }` scope (see `TASK-search-service-unified.md`).

Returns:

```ts
{
  results: Array<{
    id: string; name: string; mime: string; size: number;
    thumbnailUrl: string; visibility: string; tags: string[];
    createdAt: string; entityLinks: EntityLink[];
    matchScore: number;   // hybrid RRF score
    matchContext: string; // <mark>-wrapped snippet (when q given)
  }>;
  total: number;
  hasMore: boolean;
  facets: { type: Record<string, number>; tag: Record<string, number> };
  query: { q: string; mode: string; durationMs: number };
}
```

### Frontend changes

- `src/frontend/pages/gallery.ts` — replace `globalThis.filterAssets` with debounced (250ms) HTMX `GET /api/assets/search` + Alpine `x-data` store of `results[]`, `total`, `hasMore`, `facets`. Pagination via "load more" HTMX button (`hx-get` + `hx-trigger="revealed"` infinite scroll).
- Sort dropdown writes to URL params; backend returns ranked results.
- "Select all visible" + per-item checkboxes remain (consume `TASK-gallery-batch-operations.md`).
- Result card renders `matchContext` snippet when `q` is set (server-side FTS5 `<mark>` wrapping).

### Time caps

Reuses `TASK-search-service-unified.md` 3-tier config. Admin can set stricter per-instance caps; users can opt into slower-but-deeper search.

## Files

- `src/routes/gallery-search.ts` — new route + Elysia plugin; mounts on `/api/assets/search`
- `src/elysia-app.ts` — register `gallerySearchRoutes`
- `src/frontend/pages/gallery.ts` — rewrite filter to HTMX + Alpine
- `src/frontend/alpine/gallery-search.ts` — new store: `results[]`, `total`, `hasMore`, `facets`, `loading`
- `src/components/chat/gallery-sidebar.html` — integrate search results + load-more
- `src/partials/gallery/search-result.html` — new partial: result card with snippet + sort dropdown
- `src/validation/schemas.ts` — `GallerySearchQuery`, `GallerySearchResponse` (TypeBox)
- `src/routes/gallery-search.test.ts` — unit tests (authz, pagination, sort, fuzzy hits, time cap)
- `src/frontend/pages/gallery.test.ts` — frontend integration tests

## Acceptance Criteria

- [ ] `GET /api/assets/search` returns relevance-ranked paginated results
- [ ] Fuzzy mode (typo tolerance) finds "imge" → image, "vidoe" → video
- [ ] Sort: `relevance` (default), `created_desc`, `name_asc`, `size_desc` all wired
- [ ] Facets: `type` and `tag` counts returned in response
- [ ] Infinite scroll loads next page via HTMX `hx-trigger="revealed"`
- [ ] Time cap enforced (configurable; user > admin > global)
- [ ] Encrypted-asset search falls back gracefully (no plaintext → no fuzzy hit; explicit message in response)
- [ ] All existing gallery tests still pass; new tests cover authz + edge cases
- [ ] Frontend uses design tokens (no inline CSS)

## Dependencies

- Builds on: `TASK-search-service-unified.md` (hybrid search + scopes)
- Builds on: `src/routes/views.ts:serveGalleryGrid`, `src/assets/controller.ts` upload flow
- Bridges: `epic-gallery-batch-operations.md` (selection state preserved across search)
- Frontend: existing `src/frontend/pages/gallery.ts` + `src/partials/gallery/preview-modal.html`
- Overlaps: epic-rag-assets-unified-storage-and-assistant-flows B-R6 gallery unified search bar (same surface, different backends — reconcile or explicitly layer before implementing)
