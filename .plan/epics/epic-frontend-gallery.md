# EPIC: Frontend Gallery & Media Viewer

**Status:** ⬜ Not Started
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

- Wire existing `src/frontend/pages/gallery.ts` (82 lines, functional frontend) to the backend API route `src/routes/gallery.ts` (does not yet exist)
- Idempotent upload handling — same file upload returns existing asset ID, preventing duplicates
- Reuse the existing `raw` endpoint pattern (`/api/assets/:id/raw`) for file downloads

## Related Epics

- `epic-config-extensions` — extensible gallery configuration and ECE primitive for asset categories
- `epic-config-file-separation` — gallery and attachment config file layout (`config/galleries/`, `config/attachments/`)
- `epic-frontend-routing` — gallery route registration and client-side navigation
- `epic-frontend-components` — UI component library (modals, buttons, badges, skeletons, toasts)
- `epic-frontend-component-architecture` — component composition and page layout patterns
- `epic-frontend-encryption` — encryption UI affecting private asset preview
- `epic-db-asset-snapshot-recovery` — asset storage layer underlying the gallery viewer
- `docs/frontend/gallery.md` — UX specification

## Tickets

- [`TASK-gallery-minimal-image-asset-viewer.md`](TASK-gallery-minimal-image-asset-viewer.md) — Minimal image asset viewer: EXIF/dimensions metadata extraction, captions; images only (prerequisite for full gallery)
- [`TASK-config-gallery-attachment-idempotent.md`](TASK-config-gallery-attachment-idempotent.md) — Gallery config files, file-attachment config, idempotent load, hot-reload, API endpoints for config and asset upload (prerequisite for full gallery)

## File Structure

```
src/
├── frontend/
│   ├── pages/
│   │   └── gallery.ts              # Gallery page: search, filter, preview, actions
│   ├── gallery-upload.ts           # Drag-and-drop upload zone initialization
│   └── ...
├── partials/
│   └── gallery/
│       ├── preview-modal.html      # Preview modal partial (lazy-loaded)
│       └── upload-modal.html       # Upload modal partial (hx-target into modal container)
├── components/
│   └── chat/
│       └── gallery-sidebar.html    # Gallery sidebar within chat layout
├── views/
│   └── gallery.html                # Gallery page template
└── public/
    └── css/
        └── gallery.css             # Gallery-specific styles (design-token aligned)
docs/
└── frontend/
    └── gallery.md                  # UX specification
```

## Acceptance Criteria

- [ ] Gallery page renders at `/gallery` with asset grid, search input, type filter dropdown, and upload button
- [ ] Asset cards display thumbnail/icon (4:3 ratio), filename (truncated to one line), type badge (IMG/AUD/VID), and human-readable size label
- [ ] Clicking an asset card opens preview modal with correct rendering: images full-width constrained by aspect ratio, audio simplex player with play/pause/seek/volume, video inline with native controls
- [ ] Preview modal footer shows metadata chips (type, size, linked entities count, upload date) and action buttons (Copy URL, Download, Delete); dismiss via ×, backdrop click, or Escape
- [ ] Upload dialog supports drag-and-drop (dashed border, pink highlight on drag-over), native file picker, optional label input, and entity linking (type dropdown + ID input)
- [ ] Upload progress: button shows spinner, drop zone shows "Uploading…" with filename; on completion toast "Uploaded [filename]", modal closes, grid refreshes
- [ ] All empty/error/loading states implemented: zero assets empty state, loading skeleton (6 shimmer rectangles), filter-no-results with "Clear filters" link, upload error toast with retry, delete confirmation dialog with fade-out animation
- [ ] Idempotent upload: same file hash returns existing asset ID (no duplicates)
- [ ] Minimal image asset viewer (TASK-gallery-minimal-image-asset-viewer) wired — images display with metadata extraction and caption support
- [ ] Gallery and file-attachment config (TASK-config-gallery-attachment-idempotent) wired — config files load idempotently on server restart, gallery config defines available galleries, attachment config defines allowed types and size limits
- [ ] TypeScript typecheck passes
- [ ] CSS uses loop-lore design tokens and is responsive (min 200px card width, fills available space)
- [ ] All interactive elements carry `data-testid` attributes

## Implementation Phases

### Phase 1: Backend API

- Create `src/routes/gallery.ts` with CRUD endpoints (list, metadata, raw file, upload, delete)
- Implement idempotent upload logic — hash-based duplicate detection, same file returns existing asset ID
- Add asset metadata storage (filename, size, type, upload date, linked entities)

### Phase 2: Frontend Wiring

- Wire `src/routes/gallery.ts` to existing `src/frontend/pages/gallery.ts`
- Add gallery navigation entry from sidebar
- Integrate gallery sidebar component into chat layout

### Phase 3: Context Integration

- Gallery tab in character detail view
- Gallery tab in story view (attachments context)

### Phase 4: Polish

- Type filters (image/audio/video) with debounced search
- Upload progress state and toast feedback
- Duplicate detection UI feedback on repeated uploads
- Pagination support for large asset collections

## Files to Create/Modify

| File                             | Action                                            |
| -------------------------------- | ------------------------------------------------- |
| `src/routes/gallery.ts`          | Create — backend API route (does not exist)       |
| `src/frontend/pages/gallery.ts`  | Modify — wire to backend route (exists, 82 lines) |
| `src/frontend/alpine/gallery.ts` | Create — Alpine.js gallery state management       |
| `src/db/schema-gallery.ts`       | Create — asset metadata table                     |
