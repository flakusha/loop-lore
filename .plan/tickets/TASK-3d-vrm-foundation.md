<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-3d-vrm-foundation: 3D foundation — VRM avatars + rendering pipeline (Phases 1–2)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Large
**Type:** TASK
**Tags:** 3d, avatar, webgl, threejs, vrm
**Epic:** Epic 26 (Avatar & Expression)
**Parent:** TASK-3d-view-modes (umbrella)

## Summary

Three.js scene lifecycle, VRM avatar loading/expression/idle animation, and the WebGL rendering pipeline — the core everything else in the 3D family builds on. Consolidates former `TASK-3d-character-avatars.md`.

## Architecture (shared context)

### 3D Tech Stack

| Component    | Library                 | Notes                     |
| ------------ | ----------------------- | ------------------------- |
| Scene        | Three.js                | Core 3D rendering         |
| VRM Loader   | @pixiv/three-vrm        | Humanoid avatar format    |
| GLTF Loader  | three GLTFLoader        | General 3D model support  |
| Post-process | three postprocessing    | Bloom, outline, SSAO      |
| Animation    | Three.js AnimationMixer | Idle, expression, gesture |

### Model Formats

| Format   | Use Case          | Support Level  |
| -------- | ----------------- | -------------- |
| VRM      | Character avatars | Full (Phase 1) |
| GLTF/GLB | Objects, scenes   | Full (Phase 3 → TASK-3d-gltf-assets) |
| FBX      | Game engines      | Not supported  |

### Expression System (VRM)

| Emotion   | VRM Blend Shapes             |
| --------- | ---------------------------- |
| Happy     | happy, smileLeft, smileRight |
| Sad       | sad, cry                     |
| Angry     | angry, frown                 |
| Surprised | surprise, openMouth          |
| Neutral   | default                      |
| Speaking  | aa, ih, ou (viseme)          |

## Tasks

### Phase 1: Foundation (VRM Avatars)

- [ ] Add Three.js dependencies (`three`, `@pixiv/three-vrm`)
- [ ] Create `src/frontend/3d/scene-manager.ts` — Three.js scene lifecycle
- [ ] Create `src/frontend/3d/vrm-loader.ts` — VRM model loader + cache
- [ ] Create `src/frontend/3d/expression-controller.ts` — blend shape mapper
- [ ] Create `src/frontend/3d/idle-animation.ts` — breathing, blinking
- [ ] Add `avatar_3d_url` column to characters table (optional)
- [ ] Add VRM model upload endpoint (`POST /api/characters/:id/3d-model`)

### Phase 2: Rendering Pipeline

- [ ] Create `src/frontend/3d/renderer.ts` — WebGL → canvas/texture
- [ ] Add lighting presets (studio, dramatic, soft)
- [ ] Add camera controls (orbit, zoom) for permanent panel
- [ ] Implement emotion-to-blend-shape mapping
- [ ] Implement 2D texture snapshot for inline preview
- [ ] Add expression transition smoothing (100ms interpolation)

## Files to Create

- `src/frontend/3d/scene-manager.ts`, `vrm-loader.ts`, `expression-controller.ts`, `idle-animation.ts`, `renderer.ts`
- `package.json` — add Three.js, @pixiv/three-vrm dependencies

## Files to Modify

- `src/db/schema-characters.ts` — add `avatar_3d_url` column
- `src/db/migrations/` — migration for new columns
- `src/routes/characters.ts` — 3D model upload endpoint

## Dependencies

- Parent hub: `TASK-3d-view-modes.md`
- **Execute first** in this family: TASK-3d-view-modes-ui renders through this pipeline; TASK-3d-performance optimizes it; TASK-3d-gltf-assets shares loader infrastructure.
- Sibling (independent): TASK-avatars-dynamic-2d needs no Three.js.

## Acceptance Criteria

- [ ] VRM avatar renders in Three.js scene
- [ ] Expression changes work (emotion → blend shape)
- [ ] Idle animation plays (breathing, blinking)
