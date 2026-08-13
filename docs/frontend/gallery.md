# Frontend: Asset Gallery

**URL**: `/gallery`

## Overview

Browse, preview, upload, and manage media assets (images, audio, video). Assets use polymorphic linking — any asset can be linked to any entity type (chat, character, message, world).

## Layout

Same sidebar structure as chat, but the sidebar content shifts to curation controls:

- "Asset Gallery" title (back to chat link above it)
- Type filter dropdown: All / Images / Audio / Video
- Search input (text, filters by name/label with debounce)
- "Upload" button (primary style)

Main area is a responsive asset grid.

## Asset Grid

Responsive grid. Minimum card width 200px, fills available space.

**Each card**:

- Thumbnail or icon (4:3 aspect ratio)
  - Images: show the actual image thumbnail
  - Audio: waveform icon with filename overlay
  - Video: thumbnail with small play triangle overlay
- Filename below (truncated to one line)
- Type badge in top-right corner ("IMG", "AUD", "VID")
- Size label bottom-right (human-readable: "2.4 MB")
- Click opens the preview modal

## Preview Modal

Full overlay modal, centered. Max-width 800px, max-height 85vh.

**Preview area** (takes most of the modal):

- Images: full-width display, constrained by aspect ratio
- Audio: simplex audio player with controls (play/pause, seek, volume)
- Video: inline video player with native controls

**Footer bar**:

- Left: metadata chips — file type (MIME), size (human-readable)
- Right: action buttons — "Copy URL", "Download", "Delete"

**Dismiss**: click ×, click outside modal, press Escape.

## Upload Dialog

Overlay modal, max-width 500px.

**Upload zone** (top of modal):

- Drag-and-drop target with dashed border
- Highlights with pink border on drag-over
- Click to open native file picker
- Accepts image/_, audio/_, video/*

**Form fields** (below upload zone):

- Label (`alt_text`, optional — for search/filter)

**Actions**: Upload (primary, full-width), Cancel (ghost)

**Upload progress**: form posts to `/api/assets` via htmx; on completion the
asset grid refreshes and the modal closes. A duplicate upload returns the
existing asset with a toast notification.

## States

| State              | Visual                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero assets        | Centered empty state with icon + "No assets yet. Upload images, audio, or video." + Upload button                                                                             |
| Loading            | Grid of 6 skeleton rectangles with shimmer                                                                                                                                    |
| Filter, no results | "No assets match the current filter." with "Clear filters" link                                                                                                               |
| Upload error       | Toast: "Failed to upload [filename]. [Retry]"                                                                                                                                 |
| Delete initiated   | Confirmation dialog: "Delete [filename]? This cannot be undone." Cancel (secondary) / Delete (danger). On confirm, card animates out (fade + shrink), toast confirms deletion |
