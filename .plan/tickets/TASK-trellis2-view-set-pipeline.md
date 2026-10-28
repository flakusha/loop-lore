<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TRELLIS2 view-set pipeline

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-3d-generation
**Tags:** 3d, comfyui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Operator workflow for TRELLIS.2/Pixal3D from a single image or a view set through the workflow library; multi-image conditioning; PBR outputs linked as resource attachments. AC: end-to-end stubbed-ComfyUI test asserts the submitted graph carries the expected inputs (uploaded sources, camera info when provided); output model plus textures persist as assets with lineage to sources; PBR maps land as linked image assets.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
