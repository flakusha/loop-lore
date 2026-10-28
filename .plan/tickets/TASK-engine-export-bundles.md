<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Engine export bundles

**Status:** Not Started
**Priority:** low
**Effort:** Large
**Epic:** epic-game-asset-pipeline-export
**Tags:** export, gltf
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Bundle builder (glb plus PBR plus spz plus scene-manifest projection plus embedded regeneration manifests) with deterministic ordering (stable hashes) via the existing bulk-export machinery and SSE export stream. AC: identical inputs produce byte-identical bundles (timestamps excluded by design); the bundle listing exposes every included asset with lineage pointers; NSFW-rated assets require explicit export consent.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
