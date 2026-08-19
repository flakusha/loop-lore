<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Frontend Gallery & Media Viewer

**Status:** 🟡 Mostly Complete — gallery grid, preview, upload, entity filtering, idempotent upload, story-view attachments all working; visibility inheritance (G6) done
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** gallery, media, viewer, assets, frontend

## Summary

Frontend implementation of the Gallery & Media Viewer for the loop-lore web UI. The gallery provides a browsable, searchable asset grid with preview, upload, and management for images, audio, and video files linked to entities (chats, characters, messages, worlds). See `docs/frontend/gallery.md` for UX specification.

## Scope

### Gallery Frontend

- Gallery page at `/gallery` with responsive asset grid, type filter (All / Images / Audio / Video), search with debounce, and upload button
- Asset cards (thumbnail or icon at 4:3 aspect ratio, filename truncated to one line, type badge in top-right corner, size label bottom-right) with click-to-preview
- Preview modal (max 800px wide, 85vh tall) with content-area for image/audio/video, metadata chips (file type, size, linked entities count, upload date), and action buttons (Copy URL, Link to…, Download, Delete)
- Upload dialog (max 500px) with drag-and-drop zone (dashed border, pink highlight on drag-over), label input, entity linking (type dropdown + ID input), and progress feedback
- Upload progress and completion toasts, grid refresh on success
- All interactive states: empty state, loading skeleton (6 shimmer rectangles), filter-no-results, upload error toast, delete confirmation dialog, and link sub-dialog
- Gallery sidebar component integrated into the chat layout (same sidebar structure as chat)
- All interactive elements carry `data-testid` attributes for testability
- CSS uses loop-lore design tokens (`var(--space-*)`, `var(--color-*)`) and is responsive (min 200px card width)

### Related Backend / Integration

- Gallery frontend already wired to backend via HTMX — `serveGalleryGrid` + `serveGallerySearch` in `src/routes/views.ts` serve the grid and search; `src/assets/controller.ts` handles upload/serve/download/delete
- Idempotent upload handling — same file upload returns existing asset ID, preventing duplicates (modification to existing upload flow in `src/assets/controller.ts`)
- `raw` endpoint pattern (`/api/assets/:id/raw`) already used for file downloads

## Related Epics

- `epic-config-extensions` — extensible gallery configuration
- `epic-frontend-components` — UI component library (modals, buttons, badges)
- `epic-frontend-encryption` — encryption UI affecting private asset preview
- `docs/frontend/gallery.md` — UX specification

## Tickets

- [`TASK-gallery-minimal-image-asset-viewer.md`](TASK-gallery-minimal-image-asset-viewer.md) — ✅ Done — gallery grid, preview modal, upload dialog, all three media types
- [`TASK-config-gallery-attachment-idempotent.md`](TASK-config-gallery-attachment-idempotent.md) — ✅ Done — hash-based duplicate detection + frontend toast
- [`TASK-character-avatar-gallery-binding.md`](TASK-character-avatar-gallery-binding.md) — 🟡 Backend + entity filter + tab done; visibility inheritance (G6) done

## File Structure (verified 2026-08-01)

```
src/
├── frontend/
│   ├── pages/
│   │   └── gallery.ts              # ✅ Gallery page: search, filter, preview, actions (82 lines)
│   ├── gallery-upload.ts           # ✅ Drag-and-drop upload zone initialization
│   └── ...
├── partials/
│   └── gallery/
│       ├── preview-modal.html      # ✅ Preview modal partial (copy URL, download, delete)
│       └── upload-modal.html       # ✅ Upload modal partial (HTMX, drag-drop, label input)
├── views/
│   └── gallery.html                # ✅ Gallery page template
├── assets/
│   ├── controller.ts               # ✅ Upload, serve raw/compressed, download, delete
│   └── service.ts                  # ✅ Full CRUD, visibility, sharing, access checks
├── routes/
│   └── views.ts                    # ✅ serveGalleryGrid + serveGallerySearch (HTMX endpoints)
└── public/
    └── css/
        └── gallery.css             # ✅ Gallery-specific styles (design-token aligned)
docs/
└── frontend/
    └── gallery.md                  # ✅ UX specification
```

## Acceptance Criteria

- [x] Gallery page renders at `/gallery` with asset grid, search input, type filter dropdown, and upload button
- [x] Asset cards display thumbnail/icon (4:3 ratio), filename (truncated to one line), type badge (IMG/AUD/VID), and human-readable size label
- [x] Clicking an asset card opens preview modal with correct rendering: images full-width constrained by aspect ratio, audio simplex player with play/pause/seek/volume, video inline with native controls
- [x] Preview modal footer shows metadata chips (type, size, linked entities count, upload date) and action buttons (Copy URL, Download, Delete); dismiss via ×, backdrop click, or Escape
- [x] Upload dialog supports drag-and-drop (dashed border, pink highlight on drag-over), native file picker, optional label input, and entity linking (type dropdown + ID input)
- [x] Upload progress: button shows spinner, drop zone shows “Uploading…” with filename; on completion toast “Uploaded [filename]”, modal closes, grid refreshes
- [x] All empty/error/loading states implemented: zero assets empty state, loading skeleton, filter-no-results with “Clear filters” link, upload error toast with retry, delete confirmation dialog
- [x] Idempotent upload: same file hash returns existing asset ID (no duplicates)
- [x] Gallery entity filter — `serveGalleryGrid` and `serveGallerySearch` accept `entity_type`/`entity_id` query params
- [x] Character avatar linking — `avatar-service.ts` calls `linkAsset()` on creation
- [x] CSS uses loop-lore design tokens and is responsive (min 200px card width, fills available space)
- [x] All interactive elements carry `data-testid` attributes

## Implementation Phases

### Phase 1: Idempotent Upload

- [x] Modify `src/assets/controller.ts` upload flow to compute file hash (SHA-256) before storing
- [x] Check `assets.content_hash` for existing hash match — return existing asset ID if found
- [x] Frontend toast feedback when duplicate detected ("Asset already exists" with link)

### Phase 2: Context Integration

- [x] Gallery entity filter — `serveGalleryGrid` and `serveGallerySearch` accept `entity_type`/`entity_id` query params
- [x] Character avatar linking — `avatar-service.ts` calls `linkAsset()` on creation; `emotion-avatar-service.ts` already wired
- [ ] Gallery tab in character detail view — partial (grid exists, visibility pending)
- [x] Gallery tab in story view (attachments context) — VN scene renderer displays message-linked assets

### Phase 3: Polish

- Duplicate detection UI feedback on repeated uploads
- Pagination support for large asset collections
- Context menus on gallery items (right-click/long-press for quick actions)

## Files to Modify (remaining work)

Remaining polish (Phase 3) only:

| File                            | Action                                                    |
| ------------------------------- | --------------------------------------------------------- |
| `src/frontend/pages/gallery.ts` | Modify — add pagination support for large collections     |
| Gallery sidebar                 | Add right-click/long-press context menus on gallery items |
