> **Superseded by:** `TASK-3d-view-modes.md` — all content consolidated there.
> Implement from the consolidated task. This file preserved for reference only.

# TASK: 3D Model Support

**Status:** Not Started
**Priority:** Low
**Epic:** EPIC-2026-28
**Tags:** asset, 3d, rpg

## Summary

Add support for 3D model assets (GLTF/GLB format) for avatars, environments, and interactive objects.

## Requirements

### Model Formats

- GLTF/GLB validation
- Draco mesh compression support
- Animation clip extraction
- Material/texture extraction

### Preview Generation

- Thumbnail rendering (multiple angles)
- Wireframe fallback for unsupported browsers
- Metadata extraction (vertex count, materials, animations)

### Optimization

- Model simplification pipeline
- Texture compression (KTX2/Basis)
- LOD generation (levels of detail)

## Implementation

1. Add `Model3d` to `AssetType` enum
2. Create `src/assets/model-validator.ts` for GLTF validation
3. Create `src/assets/model-preview.ts` for thumbnail generation
4. Extend metadata extraction for 3D properties
5. Add model viewer component in frontend

## Files

- `src/db/enums.ts` — Extend AssetType
- `src/assets/model-validator.ts` — GLTF validation
- `src/assets/model-preview.ts` — Thumbnail generation
- `src/frontend/components/asset-3d-viewer.html`
- `src/frontend/components/asset-model-preview.html`
