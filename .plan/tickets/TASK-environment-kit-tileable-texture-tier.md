<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Environment kit tileable texture tier

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-scene-environment-world-generation
**Tags:** scene, textures
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Seamless texture generation (in-graph tiling nodes) plus photo-to-PBR (Materialize-CLI / Material Maker bridged) with tiling-verified validation (edge-wrap check); CHORD-class NC tooling excluded. AC: generated textures pass an automated seam check (wrap-around difference below threshold); PBR sets link to the kit.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
