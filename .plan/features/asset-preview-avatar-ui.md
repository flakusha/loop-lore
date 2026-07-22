# Feature: Asset Preview Modal & Avatar Centering UI

**Status:** 🟡 In Progress
**Worktree:** feat/asset-preview-avatar-ui
**Ticket:** TASK-001
**Created:** 2026-07-23

## Summary

Enhance the chat UI with a proper in-chat asset preview modal (replacing new-tab behavior) and add avatar face-centering logic with manual adjustment controls.

## Requirements

### 1. In-Chat Asset Preview Modal

**Current State:**

- `media-preview-modal.html` exists but only handles images
- `openMediaPreview()` in `chat-utils.ts` opens images in new tab
- `openAssetPreview()` in `gallery.ts` populates a modal but is page-specific
- Gallery sidebar clicks call `openAssetPreview()` which opens new tab for images

**Target State:**

- Single reusable modal component for all asset types (image, audio, video, other)
- Opens from:
  - Gallery sidebar item click
  - Inline message attachment click
  - Character/persona avatar click (for preview)
- Features:
  - Display filename, mime type, file size
  - Download button
  - Copy URL button
  - Delete button (with confirmation)
  - Keyboard: Escape to close
  - Click outside to close
- Asset-type-specific rendering:
  - Images: full preview with zoom capability
  - Audio: audio player with controls
  - Video: video player with controls
  - Other: file icon + download button

### 2. Avatar Face Centering

**Current State:**

- `avatar_asset_id` exists on: Users, Personas, Actors, Characters
- Avatar displayed with `object-fit: cover` (crops to fill circle)
- No offset/crop control — face may be cut off for non-centered portraits

**Target State:**

- Add `avatar_offset_x` (0-100, default 50) and `avatar_offset_y` (0-100, default 50) to relevant tables
- Apply `object-position: ${x}% ${y}%` to all avatar `<img>` elements
- Auto-detect on upload:
  - Simple heuristic: center on upper 1/3 of image (where faces typically are)
  - Store as default offset
- Manual edit UI:
  - In character/persona edit modals
  - Draggable preview (drag to reposition face)
  - Slider controls for fine-tuning
  - Reset to center button

### 3. Gallery Sidebar Enhancement

**Current State:**

- Gallery sidebar shows chat-linked assets
- Click calls `openAssetPreview()` which opens new tab

**Target State:**

- Click opens the new preview modal (not new tab)
- Support pagination for chats with many assets (lazy loading or infinite scroll)
- Show asset type icons consistently

## Implementation Plan

### Phase 1: Database Schema (avatar offsets)

**Files to modify:**

- `src/db/schema-core.ts` — Add `avatar_offset_x`, `avatar_offset_y` to Personas, Actors, Characters
- `src/db/schema-manifest.ts` — Add columns to manifest
- `src/db/migrations/` — New migration for avatar offset columns

**Schema changes:**

```typescript
// Add to Personas, Actors, Characters interfaces
avatar_offset_x: number | null; // 0-100, default 50 (center)
avatar_offset_y: number | null; // 0-100, default 50 (center)
```

### Phase 2: Asset Preview Modal Component

**Files to create:**

- `src/components/chat/asset-preview-modal.html` — Reusable modal component

**Files to modify:**

- `src/views/chat.html` — Include new modal
- `src/frontend/alpine/chat-utils.ts` — Update `openMediaPreview()` and `openAssetPreview()` to use new modal
- `src/frontend/alpine/chat-types.ts` — Add `previewAsset` state type

**Modal structure:**

```html
<div class="modal-overlay" x-show="previewAsset" @click.self="previewAsset = null">
  <div class="modal asset-preview-modal">
    <div class="modal-header">
      <span class="title" x-text="previewAsset?.filename"></span>
      <button class="btn-icon" @click="previewAsset = null">&times;</button>
    </div>
    <div class="modal-body">
      <!-- Image preview -->
      <template x-if="previewAsset?.type === 'image'">
        <img :src="previewAsset.url" class="asset-preview-img" />
      </template>
      <!-- Audio player -->
      <template x-if="previewAsset?.type === 'audio'">
        <audio controls :src="previewAsset.url" class="asset-preview-audio"></audio>
      </template>
      <!-- Video player -->
      <template x-if="previewAsset?.type === 'video'">
        <video controls :src="previewAsset.url" class="asset-preview-video"></video>
      </template>
      <!-- Other file type -->
      <template x-if="!['image','audio','video'].includes(previewAsset?.type)">
        <div class="asset-preview-other">
          <span class="file-icon">📄</span>
          <span x-text="previewAsset?.filename"></span>
        </div>
      </template>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" @click="copyAssetPreviewUrl()">📋 Copy URL</button>
      <button class="btn btn-ghost" @click="downloadAssetPreview()">⬇ Download</button>
      <button class="btn btn-danger" @click="deleteAssetPreview()">🗑 Delete</button>
    </div>
  </div>
</div>
```

### Phase 3: Avatar Offset UI

**Files to create:**

- `src/components/avatar-offset-editor.html` — Draggable avatar offset editor

**Files to modify:**

- `src/partials/characters/detail-modal.html` — Add offset editor
- `src/frontend/alpine/chat-utils.ts` — Add `applyAvatarOffset()` helper
- `src/public/css/app.css` — Add avatar offset styles

**Editor structure:**

```html
<div class="avatar-offset-editor">
  <div class="avatar-preview" :style="`object-position: ${offsetX}% ${offsetY}%`">
    <img :src="avatarUrl" />
  </div>
  <div class="offset-controls">
    <label>X: <input type="range" min="0" max="100" x-model="offsetX" /></label>
    <label>Y: <input type="range" min="0" max="100" x-model="offsetY" /></label>
    <button class="btn btn-sm" @click="resetOffset()">Reset</button>
  </div>
</div>
```

### Phase 4: CSS Updates

**Files to modify:**

- `src/public/css/app.css` — Add styles for:
  - `.asset-preview-modal` — modal layout
  - `.asset-preview-img` — image preview styling
  - `.asset-preview-audio` — audio player styling
  - `.asset-preview-video` — video player styling
  - `.avatar-offset-editor` — offset editor layout
  - `.avatar-preview` — preview container with object-position

### Phase 5: Integration & Testing

**Files to modify:**

- `src/frontend/pages/characters.ts` — Wire offset editor to save
- `src/personas/service.ts` — Handle offset fields in update
- `src/frontend/alpine/chat.ts` — Initialize preview state

**Testing:**

- Manual testing of modal open/close for each asset type
- Test avatar offset save/load
- Test keyboard navigation (Escape to close)
- Test responsive layout on mobile

## Files Summary

### Create

- `src/components/chat/asset-preview-modal.html`
- `src/components/avatar-offset-editor.html`
- `src/db/migrations/XXX_add_avatar_offsets.ts`

### Modify

- `src/db/schema-core.ts`
- `src/db/schema-manifest.ts`
- `src/views/chat.html`
- `src/frontend/alpine/chat-utils.ts`
- `src/frontend/alpine/chat-types.ts`
- `src/partials/characters/detail-modal.html`
- `src/public/css/app.css`
- `src/frontend/pages/characters.ts`
- `src/personas/service.ts`
- `src/frontend/alpine/chat.ts`

## Dependencies

- Existing asset API endpoints (`/api/assets/:id`, `/api/assets/:id/raw`)
- Existing gallery sidebar component
- Existing character/persona edit modals

## Risks

- **Face detection complexity**: Auto-detection may not work well for all images. Fallback to upper-1/3 heuristic is simple but imperfect.
- **Performance**: Preview modal adds DOM elements. Use `x-cloak` and lazy loading.
- **Migration**: Adding columns to 3 tables requires careful migration to avoid data loss.

## Acceptance Criteria

- [ ] Modal opens for all asset types (image, audio, video, other)
- [ ] Modal closes on Escape key and outside click
- [ ] Download and copy URL buttons work
- [ ] Delete button requires confirmation
- [ ] Avatar offset saves to database
- [ ] Avatar offset applies via `object-position` CSS
- [ ] Offset editor shows live preview
- [ ] Reset button returns to center (50%, 50%)
- [ ] Gallery sidebar clicks open modal (not new tab)
- [ ] All changes pass `bun run check`
