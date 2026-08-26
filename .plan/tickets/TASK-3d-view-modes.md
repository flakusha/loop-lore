<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: 3D View Modes (Umbrella)

**Status:** ⬜ Not Started — split into 5 child tickets
**Priority:** Low
**Effort:** High
**Epic:** Epic 26 (Avatar & Expression), Epic 28 (Asset Support)
**Tags:** 3d, avatar, webgl, threejs, view-mode
**Supersedes:** `TASK-3d-character-avatars.md`, `TASK-asset-3d-models.md`,
`TASK-dynamic-avatars-dota-style.md`
**Spec:** `docs/frontend/chat/visual-novel-mode.md` §Character Portraits

## Summary

Umbrella for all 3D rendering in chat: VRM/GLTF character avatars, 3D model assets,
and three view modes (permanent panel, collapsible panel, inline preview). The
original consolidated task (`TASK-3d-view-modes.md`) carried 51 task checkboxes
across six phases; those are now split verbatim into the five child tickets below.
This parent holds only goal, status, child links, and shared context — no task
checkboxes.

## Child Tickets

| Ticket | Scope | Order |
| ------ | ----- | ----- |
| `TASK-3d-vrm-foundation.md` | Phases 1–2: VRM avatars + rendering pipeline | 1st — all else builds on it |
| `TASK-3d-gltf-assets.md` | Phase 3: GLTF/GLB asset support | 2nd — shares Three.js loader |
| `TASK-3d-view-modes-ui.md` | Phase 5: view-mode switching + device-tier gating | 3rd — renders through pipeline |
| `TASK-3d-performance.md` | Phase 6: perf budgets / optimization | 4th — optimizes pipeline |
| `TASK-avatars-dynamic-2d.md` | Phase 4: Dota-style dynamic 2D avatars | independent track (no Three.js) |

## Rationale

- 3D avatars enable infinite pose/expression without pre-generated images
- Real-time rendering = no API calls for emotion changes
- Three view modes accommodate different device capabilities and user prefs
- Consolidation prevents conflicting implementations

## Architecture (shared context)

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

## Performance Targets (shared)

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

When this family is started, update the old task files:

- `TASK-3d-character-avatars.md`: Add header `> **Superseded by:** TASK-3d-view-modes.md`
- `TASK-asset-3d-models.md`: Add header `> **Superseded by:** TASK-3d-view-modes.md`
- `TASK-dynamic-avatars-dota-style.md`: Add header `> **Superseded by:** TASK-3d-view-modes.md`

## Risk

High — significant frontend complexity, WebGL dependency, model format
support, performance concerns on mobile. Phased approach mitigates:
Phase 1-2 deliver core value, Phase 3-6 are additive.
