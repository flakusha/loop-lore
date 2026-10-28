<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 3D generation fact capture

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-asset-generation-metadata
**Tags:** assets, metadata, 3d
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Record 3D run facts (reconstruction model plus version, source asset ids, camera set id, splat/mesh format, poly/splat counts derived at write) on 3D assets produced by the reconstruction run pipeline. AC: every asset persisted by the 3D pipeline carries a generation-facts row linking its source view-set assets; facts retrievable by asset id.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
