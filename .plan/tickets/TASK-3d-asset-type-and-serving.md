<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 3D asset type and serving

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-3d-generation
**Tags:** 3d, assets
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

AssetType gains model3d (format-discriminated glb/gltf/ply/spz/usdz via metadata, one type), magic-byte detect/validate (glb magic, PLY header, SPZ/zip), serve routes parity, and poster/thumb renditions. AC: upload of a real glb and spz round-trips with correct type plus dims-in-metadata (poly/splat counts where derivable); wrong-magic-vs-extension rejected; encryption tier honored.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Research addendum (2026-11-25)

- Verified gaps: `AssetType.Model` and GLB MIME exist, but `detectAssetType` returns `Other`, `MIME_MAP` lacks `glb`/`gltf`, and egui upload accept lists exclude model MIME.
- Fix magic-byte detection and MIME mapping in the shared validation path so every caller benefits, rather than patching one route.
- Serving stays signed `/raw` plus typed `previewRef`/`posterRef`; no browser-only route and no plaintext preview path.
