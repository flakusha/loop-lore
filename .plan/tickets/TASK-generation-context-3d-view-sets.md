<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Generation context 3D view-sets

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-multimodal-asset-reuse
**Tags:** assets, api, 3d
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Extend GET /api/assets/:id/generation-context to emit view-set and 3D context (camera facts, set membership, model format/PBR inventory) for downstream generation. AC: a view-set member asset returns its set plus camera facts in the context payload; a 3D asset returns format plus PBR inventory; image/video context shape is unchanged for existing consumers.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
