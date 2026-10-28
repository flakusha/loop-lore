<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Photogrammetry external tier

**Status:** Not Started
**Priority:** medium
**Effort:** XL
**Epic:** epic-3d-generation
**Tags:** 3d, photogrammetry
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Capability-probed external binaries (COLMAP, gsplat/nerfstudio) orchestrated by the run pipeline: view set to COLMAP export (view-set camera conventions) to trainer to SPZ/PLY ingest; capture-import path (upload PLY/SPZ with camera metadata); sparse-view research tier flagged experimental. AC: with binaries present a synthetic two-view set produces a splat asset; with binaries absent the run fails fast with a capability message (probe result, not a crash); SPZ chosen as storage, PLY accepted as input.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
