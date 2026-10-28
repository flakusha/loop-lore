<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Gallery set and 3D surface

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-gallery-batch-operations
**Tags:** gallery, views, 3d
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Set cards plus 3D/splat preview cards integration (viewer component from the 3D epic), camera/format chips, and facet-filter readiness once generation facts land. AC: gallery renders view-set grouped cards and 3D preview cards without loading full-size blobs; chips derive from generation facts; facet filter composes with existing tag filters.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
