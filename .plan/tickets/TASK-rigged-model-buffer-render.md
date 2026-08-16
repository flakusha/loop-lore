<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Rigged Model Buffer Render — Pre-rendered Expressions

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Med
**Related:** TASK-3d-character-avatars, TASK-emotions-avatar-edit-model

## Summary

Pre-render rigged 3D model expressions into sprite sheet buffers. Enables emotion avatars without real-time WebGL rendering — works on low-end devices, offline, and in TUI.

## Rationale

- Real-time 3D rendering is expensive (WebGL, GPU)
- TUI has no WebGL support — needs pre-rendered images
- Sprite sheets are fast to load and display
- Consistent appearance across Web UI and TUI

## Architecture

### Sprite Sheet Generation

```
Input: VRM/GLTF rigged model + expression list
  ↓
Three.js offline renderer (Node.js or headless)
  ↓
Sprite sheet (PNG/AVIF):
  [happy] [sad] [angry] [surprised] [neutral]
  [256x256] [256x256] [256x256] [256x256] [256x256]
  ↓
Cache to assets/ with metadata tag
```

### Display

| Context      | Method                                |
| ------------ | ------------------------------------- |
| Web UI       | CSS sprite animation or canvas draw   |
| TUI          | ASCII art from sprite (image-to-text) |
| Chat message | `<img>` with CSS class for expression |
| Export       | Individual PNGs per expression        |

## Tasks

### Phase 1: Offline Renderer

- [ ] Create `src/3d/sprite-renderer.ts` — headless Three.js renderer
- [ ] Implement expression iteration (blend shapes → render loop)
- [ ] Generate sprite sheet PNG from expression frames
- [ ] Add metadata: frame dimensions, expression order, frame count
- [ ] Unit tests for sprite sheet generation

### Phase 2: Storage

- [ ] Create `character_sprite_sheets` table (character_id, model_hash, sheet_url, expressions)
- [ ] Add sprite sheet endpoint: `GET /api/characters/:id/sprites/:emotion`
- [ ] Cache invalidation on model update
- [ ] Storage optimization (AVIF for web, PNG for TUI)

### Phase 3: Display Integration

- [ ] Web UI: CSS sprite animation for expression changes
- [ ] Chat messages: emotion class on avatar `<img>`
- [ ] TUI: image-to-ASCII conversion (libsixel or chafa)
- [ ] Add expression selector in character editor (preview all expressions)

### Phase 4: Optimization

- [ ] Lazy generation (only on first request, cache)
- [ ] Shared sprite sheets across characters (same model, different textures)
- [ ] Compression (AVIF 80% quality ≈ 50% smaller than PNG)
- [ ] CDN-ready URLs for static sprite sheets

## Files to Create

- `src/3d/sprite-renderer.ts` — headless renderer
- `src/3d/sprite-renderer.test.ts` — tests
- `src/db/schema-sprites.ts` — sprite sheet table

## Files to Modify

- `src/routes/characters.ts` — sprite sheet endpoint
- `src/views/chat.html` — emotion class on avatars
- `src/frontend/alpine/chat.ts` — emotion state management
- `src/tui/chat.ts` — ASCII avatar display

## Performance

| Metric            | Target              | Notes               |
| ----------------- | ------------------- | ------------------- |
| Generation time   | < 10s per character | Offline, async      |
| Sprite sheet size | < 200KB             | AVIF, 5 expressions |
| Display load      | < 100ms             | Cached, HTTP/2      |
| TUI render        | < 50ms              | libsixel/chafa      |

## Risk

Med — requires headless Three.js setup, sprite sheet pipeline, multi-platform display logic.
