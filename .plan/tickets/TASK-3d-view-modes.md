<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: 3D View Modes (Consolidated)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** High
**Epic:** Epic 26 (Avatar & Expression), Epic 28 (Asset Support)
**Tags:** 3d, avatar, webgl, threejs, view-mode
**Supersedes:** `TASK-3d-character-avatars.md`, `TASK-asset-3d-models.md`,
`TASK-dynamic-avatars-dota-style.md`
**Spec:** `docs/frontend/chat/visual-novel-mode.md` §Character Portraits

## Summary

Consolidated task for all 3D rendering in chat: VRM/GLTF character
avatars, 3D model assets, and three view modes (permanent panel,
collapsible panel, inline preview). Merges three previously separate
tasks into one coherent implementation.

## Superseded Tasks

| Old Task                             | What It Covered                    | What's New Here           |
| ------------------------------------ | ---------------------------------- | ------------------------- |
| `TASK-3d-character-avatars.md`       | VRM avatars, expressions, Three.js | Consolidated as Phase 1-2 |
| `TASK-asset-3d-models.md`            | GLTF validation, preview           | Consolidated as Phase 3   |
| `TASK-dynamic-avatars-dota-style.md` | Animated 2D mugshots, Spine        | Consolidated as Phase 4   |

> **Migration note:** The old files should be updated with a redirect
> to this task. Their content is preserved here — nothing is lost.

## Rationale

- 3D avatars enable infinite pose/expression without pre-generated images
- Real-time rendering = no API calls for emotion changes
- Three view modes accommodate different device capabilities and user prefs
- Consolidation prevents conflicting implementations

## Architecture

### 3D Tech Stack

| Component    | Library                 | Notes                     |
| ------------ | ----------------------- | ------------------------- |
| Scene        | Three.js                | Core 3D rendering         |
| VRM Loader   | @pixiv/three-vrm        | Humanoid avatar format    |
| GLTF Loader  | three GLTFLoader        | General 3D model support  |
| Post-process | three postprocessing    | Bloom, outline, SSAO      |
| Animation    | Three.js AnimationMixer | Idle, expression, gesture |

### View Modes

#### 1. Permanent Panel

Always-visible side panel with 3D avatar:

```
┌──────────────────┬──────────────────────────┐
│                  │ [chat messages]          │
│   3D Avatar      │                          │
│   (always        │ [chat messages]          │
│    rendered)     │                          │
│                  │ [input area]             │
└──────────────────┴──────────────────────────┘
```

- Width: configurable (200-400px, default 280px)
- Renders continuously (requestAnimationFrame loop)
- Avatar reacts to chat events (typing, message received)
- Collapse button to hide panel

#### 2. Collapsible Panel

Expandable panel that shows 3D avatar on demand:

```
[chat header]  [▶ 3D]     ← toggle button in header
                                    
[chat messages]              ← normal chat layout

[input area]
```

Click "▶ 3D" → panel slides out from right (like character info panel).
Avatar renders only when panel is open.

- Panel: 300px wide, slides from right
- Renders on open, pauses on close (dispose WebGL context)
- Same interaction as permanent panel

#### 3. Inline Preview

Small 3D preview within message bubbles:

```
┌──────────────────────────────┐
│ [tiny 3D] Character Name     │
│ "The forest is dark..."      │
└──────────────────────────────┘
```

- Size: 48x48px (same as avatar circle)
- Renders as static snapshot (not animated)
- Click to expand (opens collapsible panel or modal)
- WebGL → 2D texture conversion for performance

### Model Formats

| Format   | Use Case          | Support Level  |
| -------- | ----------------- | -------------- |
| VRM      | Character avatars | Full (Phase 1) |
| GLTF/GLB | Objects, scenes   | Full (Phase 3) |
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

### Device Tier Gating

| Tier   | WebGL2 | Memory | Feature                        |
| ------ | ------ | ------ | ------------------------------ |
| High   | ✅     | ≥4GB   | Full 3D, animations, particles |
| Medium | ✅     | ≥2GB   | 3D avatars, no particles       |
| Low    | ❌     | <2GB   | 2D fallback (static images)    |

Detection: `src/frontend/alpine/device-tier.ts` (exists in index.json).

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

### Phase 3: GLTF Asset Support

- [ ] Create `src/assets/model-validator.ts` — GLTF validation
- [ ] Create `src/assets/model-preview.ts` — thumbnail generation
- [ ] Add `Model3d` to `AssetType` enum
- [ ] Add GLTF metadata extraction (vertex count, materials, animations)
- [ ] Create model viewer component (standalone, not avatar-specific)

### Phase 4: Dynamic 2D Avatars (Dota-style)

- [ ] Evaluate Spine 2D vs DragonBones (licensing, features)
- [ ] Create `src/frontend/avatar/avatar-machine.ts` — animation state machine
- [ ] Create `src/frontend/avatar/spine-renderer.ts` — Spine/DragonBones renderer
- [ ] Implement idle animation (breathing, blinking)
- [ ] Implement expression morph targets
- [ ] Add ambient particle system (fire, frost, magic aura)
- [ ] Add audio triggers (hover, select, expression change)
- [ ] Wire expression state to chat events (typing → alert, message → emotion)

### Phase 5: View Modes

- [ ] Create `src/frontend/3d/view-modes.ts` — view mode manager
- [ ] Implement permanent panel (always rendered, configurable width)
- [ ] Implement collapsible panel (render on open, dispose on close)
- [ ] Implement inline preview (static snapshot, click to expand)
- [ ] Add toggle button in chat header
- [ ] Add panel width setting (localStorage)
- [ ] Wire to device tier (low = 2D fallback)

### Phase 6: Performance & Optimization

- [ ] Implement model caching (GLB → IndexedDB)
- [ ] Add LOD (level of detail) for performance
- [ ] Implement sprite sheet caching for 2D animations
- [ ] GPU particle optimization
- [ ] Audio pooling and spatial audio
- [ ] Add `prefers-reduced-motion` support (disable animations)
- [ ] Memory management: dispose WebGL contexts when not visible

## Files to Create

- `src/frontend/3d/scene-manager.ts` — Three.js scene lifecycle
- `src/frontend/3d/vrm-loader.ts` — VRM model loader
- `src/frontend/3d/expression-controller.ts` — blend shapes
- `src/frontend/3d/idle-animation.ts` — idle animations
- `src/frontend/3d/renderer.ts` — WebGL rendering
- `src/frontend/3d/view-modes.ts` — permanent/collapsible/inline
- `src/frontend/3d/styles.css` — 3D panel styles
- `src/assets/model-validator.ts` — GLTF validation
- `src/assets/model-preview.ts` — thumbnail generation
- `src/frontend/avatar/avatar-machine.ts` — 2D animation state machine
- `src/frontend/avatar/spine-renderer.ts` — Spine renderer
- `src/frontend/avatar/particle-system.ts` — ambient effects
- `src/frontend/avatar/audio-manager.ts` — spatial audio

## Files to Modify

- `src/db/enums.ts` — add `Model3d` to AssetType
- `src/db/schema-characters.ts` — add `avatar_3d_url` column
- `src/db/migrations/` — migration for new columns
- `src/routes/characters.ts` — 3D model upload endpoint
- `src/routes/assets.ts` — GLTF validation
- `src/views/chat.html` — 3D panel containers
- `src/frontend/alpine/chat.ts` — 3D state binding
- `package.json` — add Three.js, @pixiv/three-vrm dependencies

## Performance

| Metric            | Target  | Notes                     |
| ----------------- | ------- | ------------------------- |
| Model load        | < 2s    | Cache after first load    |
| Expression change | < 100ms | Blend shape interpolation |
| Idle animation    | 30+ FPS | requestAnimationFrame     |
| Memory (3D)       | < 80MB  | LOD, model disposal       |
| Memory (2D spine) | < 50MB  | Sprite sheets + audio     |
| Inline snapshot   | < 50ms  | WebGL → canvas capture    |
| Particle count    | < 50    | Ambient only              |

## Migration from Old Tasks

When this task is started, update the old task files:

- `TASK-3d-character-avatars.md`: Add header `> **Superseded by:** TASK-3d-view-modes.md`
- `TASK-asset-3d-models.md`: Add header `> **Superseded by:** TASK-3d-view-modes.md`
- `TASK-dynamic-avatars-dota-style.md`: Add header `> **Superseded by:** TASK-3d-view-modes.md`

## Acceptance Criteria

- [ ] VRM avatar renders in Three.js scene
- [ ] Expression changes work (emotion → blend shape)
- [ ] Idle animation plays (breathing, blinking)
- [ ] Permanent panel shows 3D avatar alongside chat
- [ ] Collapsible panel opens/closes with proper lifecycle
- [ ] Inline preview shows static snapshot
- [ ] Device tier gating: low devices get 2D fallback
- [ ] GLTF models validate and show thumbnails
- [ ] Spine 2D avatars animate (if implemented)
- [ ] Memory stays under 80MB with 3D active
- [ ] No WebGL errors in console

## Risk

High — significant frontend complexity, WebGL dependency, model format
support, performance concerns on mobile. Phased approach mitigates:
Phase 1-2 deliver core value, Phase 3-6 are additive.
