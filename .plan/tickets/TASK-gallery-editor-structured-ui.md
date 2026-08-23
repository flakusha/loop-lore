<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-gallery-editor-structured-ui

**Status**: open
**Priority**: medium
**Labels**: frontend, gallery-editor, ux, alpine, htmx, assets
**Assignee**:
**Epic**: epic-frontend-gallery
**Related**: `src/routes/views/gallery.ts`, `src/routes/character-avatars.ts`, `docs/spec/assets.md`

## Description

The gallery view route exists (`src/routes/views/gallery.ts`) but there's no
dedicated gallery editor UI. Asset management is scattered across character
avatars, emotion avatars, and the gallery view.

**Current state**:
- Gallery view route renders asset list
- Character avatars managed via `/api/actors/:id/avatars` endpoints
- Emotion avatars managed via character-emotion-avatars routes
- Asset upload and linking pipeline exists (`docs/spec/assets.md`)
- `loadCharacterGallery()` in `characters.ts` loads linked assets for detail modal

**Missing editor capabilities**:
- Bulk asset upload with tagging
- Asset metadata editing (alt text, tags, license, attribution)
- Asset organization (folders, collections)
- Asset linking to characters/worlds/locations
- Asset deduplication detection
- Gallery view: sort, filter, search, thumbnail grid
- Asset usage tracking (which characters/worlds use this asset)

### Acceptance Criteria

- [ ] Gallery editor page: accessible from main nav, world editor, character editor
- [ ] **Upload area**: drag-and-drop, multi-file, progress bars, format validation
- [ ] **Asset grid**: thumbnail grid with lazy loading, sort by name/date/type/size
- [ ] **Asset detail**: click to view full size, metadata panel (alt text, tags, license, attribution, dimensions, file size)
- [ ] **Inline editing**: edit alt text, tags, license directly in grid/detail view
- [ ] **Bulk operations**: select multiple → tag, delete, link to character/world
- [ ] **Link manager**: for each asset, show which characters/worlds/locations reference it
- [ ] **Deduplication**: on upload, detect duplicate by content hash → offer skip/replace
- [ ] **Filter bar**: by type (image/audio/video), by tag, by linked entity
- [ ] **Search**: full-text search on alt_text, tags, filename
- [ ] **Delete**: with confirmation and "used by N entities" warning
- [ ] htmx partials for grid, detail, upload with Alpine hydration
- [ ] Unit test: upload flow, metadata edit, link management, deduplication

### Notes

- Asset upload endpoint likely at `POST /api/assets` — check `src/routes/` for implementation
- Asset metadata stored in `assets` table — check `src/db/schema.ts`
- Thumbnail generation already exists (`/api/assets/:id/thumb` in character detail modal)
- Content hash deduplication: `Bun.CryptoHasher` or `crypto.createHash('sha256')`
- Gallery is read-only view (`src/routes/views/gallery.ts`) — editor needs new routes
- Asset linking uses `asset_links` table with polymorphic `(entity_type, entity_id)`
