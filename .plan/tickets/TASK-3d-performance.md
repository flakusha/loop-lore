<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-3d-performance: Performance budgets & optimization (Phase 6)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Type:** TASK
**Tags:** 3d, performance, webgl
**Epic:** Epic 26 (Avatar & Expression), Epic 28 (Asset Support)
**Parent:** TASK-3d-view-modes (umbrella)

## Summary

Performance budgets, model caching, LOD, sprite-sheet caching, GPU particle
optimization, audio pooling, reduced-motion support, and WebGL memory management
across the 3D stack. Optimizes the Phase 1–5 pipeline. Consolidates the Phase 6
work of the former `TASK-3d-view-modes.md`.

## Context (shared performance targets, from parent)

| Metric            | Target  | Notes                     |
| ----------------- | ------- | ------------------------- |
| Model load        | < 2s    | Cache after first load    |
| Expression change | < 100ms | Blend shape interpolation |
| Idle animation    | 30+ FPS | requestAnimationFrame     |
| Memory (3D)       | < 80MB  | LOD, model disposal       |
| Memory (2D spine) | < 50MB  | Sprite sheets + audio     |
| Inline snapshot   | < 50ms  | WebGL → canvas capture    |
| Particle count    | < 50    | Ambient only              |

## Tasks

### Phase 6: Performance & Optimization

- [ ] Implement model caching (GLB → IndexedDB)
- [ ] Add LOD (level of detail) for performance
- [ ] Implement sprite sheet caching for 2D animations
- [ ] GPU particle optimization
- [ ] Audio pooling and spatial audio
- [ ] Add `prefers-reduced-motion` support (disable animations)
- [ ] Memory management: dispose WebGL contexts when not visible

## Dependencies

- Parent hub: `TASK-3d-view-modes.md`
- **After:** TASK-3d-vrm-foundation, TASK-3d-gltf-assets, TASK-3d-view-modes-ui
  (optimizes the pipeline those build).

## Acceptance Criteria

- [ ] Memory stays under 80MB with 3D active
- [ ] No WebGL errors in console
