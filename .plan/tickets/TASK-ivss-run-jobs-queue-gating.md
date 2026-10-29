<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS run jobs queue gating

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, queue, gpu-gating
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

DB-backed run job records (emotion-avatar job-records pattern, survives restarts), flow-control/cancellation wiring, a rate-limit policy entry for the run suffix, and per-workflow min_vram + capability probes on the library rows. AC: a cancelled run stops within one poll interval and persists its terminal state; a missing-model run fails fast with the probe's explanation.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
