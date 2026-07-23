# EPIC: 3D Asset Generation (Future)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Very High
**Type:** Vision Epic
**Tags:** 3d, generation, three.js, webgl, mesh, scene, future

## Overview

Long-horizon vision for 3D asset generation and rendering. This epic covers:

1. **3D model generation** — text/image-to-3D via inference providers
2. **3D scene rendering** — interactive 3D scenes in browser (Three.js/WebGL)
3. **3D avatar system** — character avatars with emotion/expression (extends Epic 26)
4. **3D world navigation** — explorable world maps (extends ideas #31-34)
5. **Device-tier gating** — progressive enhancement for weak devices

> ⚠️ **Performance caveat:** 3D requires WebGL2/GPU. All 3D features MUST be
> progressive enhancement: capped at device tier, default off, 2D fallback.
> See `docs/ideas/worlds-3d-navigation.md` for device gating strategy.

## Current State

| Area          | File                      | State     | Notes                            |
| ------------- | ------------------------- | --------- | -------------------------------- |
| 3D in assets  | `src/db/enums-content.ts` | 🟡 Schema | `model/3d` MIME type exists      |
| Three.js dep  | —                         | ❌        | Not installed                    |
| 3D renderer   | —                         | ❌        | No WebGL code                    |
| 3D generation | —                         | ❌        | No text-to-3D provider           |
| Avatar system | Epic 26                   | ⬜        | Avatar & Expression (planned)    |
| World maps    | ideas #31-34              | 💡        | 3D world navigation (ideas only) |

## Design

### 3D Generation Pipeline

```
Text prompt or reference image
→ 3D generation provider (Meshy, TripoSR, InstantMesh)
→ glTF/FBX output
→ Asset storage (link to character/location/item)
→ Frontend rendering (Three.js scene)
```

### Provider Options

| Provider        | Type             | Cost | Quality | Latency |
| --------------- | ---------------- | ---- | ------- | ------- |
| TripoSR (local) | Text-to-3D       | Free | Medium  | High    |
| Meshy           | Text/Image-to-3D | $    | High    | Med     |
| InstantMesh     | Image-to-3D      | Free | Good    | High    |
| Stability AI 3D | Text-to-3D       | $    | High    | Med     |

### Device-Tier Gating

```typescript
interface DeviceCapabilities {
  webgl2: boolean;
  gpu: boolean;
  deviceMemory: number; // GB
  saveData: boolean;
}

function getDeviceTier(capabilities: DeviceCapabilities,): "high" | "medium" | "low" | "none" {
  if (!capabilities.webgl2 || !capabilities.gpu) { return "none"; }
  if (capabilities.deviceMemory < 2 || capabilities.saveData) { return "low"; }
  if (capabilities.deviceMemory < 4) { return "medium"; }
  return "high";
}
```

### 3D Scene Component

```typescript
interface Scene3D {
  id: string;
  location_id?: string;
  camera: { position: [number, number, number,]; target: [number, number, number,] };
  objects: SceneObject[];
  lighting: LightingConfig;
  ambient_audio_id?: string; // links to Epic: Audio/Video
}

interface SceneObject {
  id: string;
  model_url: string; // glTF/FBX
  position: [number, number, number,];
  rotation: [number, number, number,];
  scale: [number, number, number,];
  animation?: string; // idle, talk, attack, etc.
}
```

## Tasks

### Phase 1 — Foundation

- [ ] Device capability detection (`src/frontend/3d/device-check.ts`)
- [ ] Three.js dependency + lazy loading
- [ ] 3D model loader (glTF via GLTFLoader)
- [ ] Basic scene renderer (`src/frontend/3d/scene.ts`)
- [ ] Asset integration (link 3D models to characters/locations)
- [ ] Settings toggle: "Enable 3D rendering"
- [ ] 2D fallback for unsupported devices

### Phase 2 — 3D Generation

- [ ] 3D generation provider interface
- [ ] TripoSR local integration
- [ ] Meshy cloud integration
- [ ] Text-to-3D pipeline
- [ ] Image-to-3D pipeline
- [ ] Generated model → asset storage
- [ ] `POST /api/3d/generate` route

### Phase 3 — Avatar System (extends Epic 26)

- [ ] VRM avatar loader
- [ ] Emotion-driven expression controller
- [ ] Character pose system
- [ ] Avatar preview in character editor
- [ ] Sprite sheet generation from 3D models

### Phase 4 — World Navigation (extends ideas #31-34)

- [ ] 3D world map renderer
- [ ] Location nodes as 3D terrain
- [ ] Path visualization between locations
- [ ] Interactive scene view (first/third person)
- [ ] Ambient audio integration (Epic: Audio/Video)
- [ ] Spatial audio positioning

## Dependencies

- Existing: Epic 26 (Avatar & Expression) — Phase 3 extends this
- Existing: `src/assets/` (asset storage + linking)
- Existing: `src/db/enums-content.ts` (3d MIME type)
- New: Three.js (npm dependency)
- New: 3D generation provider(s)

## Testing Strategy

| Test        | Coverage                         | Files                                     |
| ----------- | -------------------------------- | ----------------------------------------- |
| Unit        | Device tier detection            | `src/frontend/3d/device-check.test.ts`    |
| Unit        | Scene object positioning         | `src/frontend/3d/scene.test.ts`           |
| Integration | 3D generation pipeline           | `tests/integration/3d-generation.test.ts` |
| E2E         | Full 3D flow (generate → render) | `tests/e2e/flows/3d.test.ts`              |

## Files (proposed)

- `src/frontend/3d/` — 3D rendering module
- `src/frontend/3d/scene.ts` — scene manager
- `src/frontend/3d/device-check.ts` — capability detection
- `src/frontend/3d/avatar.ts` — avatar renderer
- `src/frontend/3d/world-map.ts` — world navigation
- `src/generation/providers/3d.ts` — 3D generation provider
- `src/routes/three-d.ts` — 3D API routes

## Open Questions

1. **Provider choice:** Which 3D generation provider for v1? TripoSR (free) or Meshy (quality)?
2. **File format:** glTF vs FBX vs USD? glTF is web-standard.
3. **Performance:** How many 3D objects can render at 60fps on mid-range devices?
4. **Streaming:** Should 3D generation stream progress or return complete model?
5. **Caching:** Should generated 3D models be cached client-side?

## Linked Tasks

- TASK-3d-generation.md
