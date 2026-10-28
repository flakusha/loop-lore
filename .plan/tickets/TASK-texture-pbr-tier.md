<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Texture PBR tier

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-3d-generation
**Tags:** 3d, pbr
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Texture/refine tier: Material Anything (MIT) default workflow; CHORD tier behind a research-only config flag. AC: a texture pass produces basecolor/roughness/metallic linked to the model; NC-tier workflows refuse to run without the research-only flag (admin-acknowledged).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
