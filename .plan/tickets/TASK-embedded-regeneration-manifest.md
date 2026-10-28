<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Embedded regeneration manifest

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-asset-generation-metadata
**Tags:** assets, metadata
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Write-back embedding: a compact regeneration manifest (workflow id, params, seeds, source-asset ids, lineage pointer) embedded into PNG tEXt chunks (ComfyUI prompt/workflow chunk-compatible, iTXt added where needed) for images, and glTF extras (loop-lore.regeneration.v1) plus KHR_xmp_json_ld attribution for 3D outputs; read-side parser with a detection-method stamp reusing src/assets/png-text-chunk.ts decode path. AC: an exported asset re-imported into a fresh instance exposes its full regeneration manifest; ComfyUI still recognizes embedded workflow chunks on round-trip (fixture from a real export); manifest write is size-capped with overflow to the DB row.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
