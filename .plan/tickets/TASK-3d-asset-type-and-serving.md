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
