<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> **Superseded by:** `TASK-3d-view-modes.md` — all content consolidated there.
> Implement from the consolidated task. This file preserved for reference only.

# TASK: 3D Character Avatars

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** High
**Related:** TASK-emotions-avatar-edit-model

## Summary

Replace static 2D character images with 3D rendered avatars using Three.js or similar. Enables dynamic poses, lighting, camera angles, and real-time expression changes.

## Rationale

- 3D avatars enable infinite pose/expression variations without pre-generating images
- Real-time rendering = no API calls for emotion changes
- Consistent art style across all characters (same 3D pipeline)
- Camera controls for user interaction (rotate, zoom)

## Current State

- Characters use static 2D images (`avatar_url` → asset)
- No 3D model pipeline exists
- `src/public/` has no Three.js or WebGL dependencies
- No rigged model format support (FBX, GLTF, VRM)

## Architecture

### Model Format

| Format   | Use Case           | Notes                                |
| -------- | ------------------ | ------------------------------------ |
| VRM      | Anime/VTuber style | Humanoid, blend shapes, spring bones |
| GLTF/GLB | General 3D         | Universal, PBR materials             |
| FBX      | Game engines       | Legacy, complex rigging              |

**Recommendation:** VRM for character avatars (humanoid focus, blend shapes for expressions)

### Rendering Pipeline

```
Character Avatar (VRM/GLTF)
  ├── Three.js scene setup (lighting, camera)
  ├── VRM loader + animator
  ├── Blend shape controller (expression mapping)
  ├── Post-processing (bloom, outline)
  └── Canvas → texture for UI
```

### Expression System

| Emotion   | VRM Blend Shapes             |
| --------- | ---------------------------- |
| Happy     | happy, smileLeft, smileRight |
| Sad       | sad, cry                     |
| Angry     | angry, frown                 |
| Surprised | surprise, openMouth          |
| Neutral   | default                      |

## Tasks

### Phase 1: Foundation

- [ ] Add Three.js dependency (`three`, `@pixiv/three-vrm`)
- [ ] Create `src/frontend/3d/avatar-scene.ts` — Three.js scene manager
- [ ] Create `src/frontend/3d/vrm-loader.ts` — VRM model loader
- [ ] Create `src/frontend/3d/expression-controller.ts` — blend shape mapper
- [ ] Add `avatar_3d_url` column to characters table (optional, falls back to 2D)

### Phase 2: Rendering

- [ ] Implement avatar canvas renderer (WebGL → 2D texture)
- [ ] Add lighting presets (studio, dramatic, soft)
- [ ] Add camera controls (orbit, zoom)
- [ ] Implement emotion-to-blend-shape mapping
- [ ] Add fallback: if no 3D model, use 2D image

### Phase 3: Integration

- [ ] Wire 3D avatar into chat message display
- [ ] Add 3D avatar preview in character editor
- [ ] Add model upload endpoint (VRM/GLTF)
- [ ] Add model viewer component

### Phase 4: Optimization

- [ ] Implement model caching (GLB → IndexedDB)
- [ ] Add LOD (level of detail) for performance
- [ ] Implement idle animation (breathing, blink)
- [ ] Add expression transition smoothing

## Files to Create

- `src/frontend/3d/avatar-scene.ts` — Three.js scene
- `src/frontend/3d/vrm-loader.ts` — VRM loader
- `src/frontend/3d/expression-controller.ts` — expression mapper
- `src/frontend/3d/avatar-renderer.ts` — canvas → texture

## Files to Modify

- `src/db/schema-characters.ts` — add `avatar_3d_url` column
- `src/routes/characters.ts` — 3D model upload
- `src/views/character-editor.html` — 3D preview
- `src/views/chat.html` — 3D avatar in messages
- `package.json` — add Three.js deps

## Performance Considerations

| Metric            | Target  | Notes                     |
| ----------------- | ------- | ------------------------- |
| Model load        | < 2s    | Cache after first load    |
| Expression change | < 100ms | Blend shape interpolation |
| Memory            | < 50MB  | LOD, model disposal       |
| FPS               | 30+     | Idle animation only       |

## Risk

High — significant frontend complexity, WebGL dependency, model format support, performance concerns on mobile.
