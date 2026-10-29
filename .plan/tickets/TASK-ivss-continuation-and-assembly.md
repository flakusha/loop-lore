<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS continuation and assembly

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, video, melt
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Director Continuity + Join Clips plus MLT XML EDL generation and the melt render tier (subprocess like the Blender bridge pattern: capability-probed, timeout-bounded, provenance-stamped). AC: a 3-scene scenario renders one assembled video via melt (or Director joins when that tier is selected); melt exit codes surface as run errors.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
