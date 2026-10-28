<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Environment kit skybox HDRI tier

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-scene-environment-world-generation
**Tags:** scene, skybox, licensing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Panorama-to-skybox tier (equirect workflows; license-fenced tiling tier carries the CC BY-NC-SA fence) plus env-map research tier; outputs stored as image assets with projection metadata (equirect flag in generation facts). AC: a generated panorama renders as a skybox in the 3D viewer and as a VN background; the NC-fenced workflow refuses without the research flag; projection metadata round-trips.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
