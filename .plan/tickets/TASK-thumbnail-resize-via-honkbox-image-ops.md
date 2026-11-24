<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Thumbnail resize via honkbox image-ops

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-asset-transform-metadata
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: new caller mirroring artifacts.ts for v1 image-ops resize; op absent falls back to local provider. AC: local path unchanged when flag off. Note: may overlap in-flight slice D in tree honkbox-coverage-2026-11-24; close as duplicate if landed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
