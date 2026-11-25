<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-3d-gltf-assets: 3D GLTF/GLB asset support (Phase 3)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** Low
**Effort:** Medium
**Type:** TASK
**Tags:** 3d, gltf, assets
**Epic:** epic-3d-generation
**Parent:** TASK-3d-view-modes (umbrella)

## Summary

GLTF/GLB as a general asset type: validation, thumbnail generation, metadata extraction, and a standalone model viewer (not avatar-specific). Consolidates former `TASK-asset-3d-models.md`.

## Tasks

### Phase 3: GLTF Asset Support

- [ ] Create `src/assets/model-validator.ts` — GLTF validation
- [ ] Create `src/assets/model-preview.ts` — thumbnail generation
- [ ] Add `Model3d` to `AssetType` enum (`src/db/enums.ts`)
- [ ] Add GLTF metadata extraction (vertex count, materials, animations)
- [ ] Create model viewer component (standalone, not avatar-specific)

## Files to Modify

- `src/db/enums.ts` — add `Model3d` to AssetType
- `src/routes/assets.ts` — GLTF validation

## Dependencies

- Parent hub: `TASK-3d-view-modes.md`
- **After:** TASK-3d-vrm-foundation (shares Three.js loader infrastructure; viewer reuses renderer).
- Siblings: independent of TASK-avatars-dynamic-2d; assets surface in TASK-3d-view-modes-ui previews.

## Acceptance Criteria

- [ ] GLTF models validate and show thumbnails

## Research addendum (2026-11-25)

- Standalone viewer is not a promotion requirement: web and egui renderers are separately gated on named consumers and bundle budget.
- Metadata extraction should reuse honkbox manifest fields (poly count, material list, artifact hash) when present; do not re-parse GLB on the server for data already carried in the bundle manifest.
- GLB poster remains an honkbox-generated still until a native renderer lands.
