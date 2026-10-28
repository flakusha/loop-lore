<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: View-set orbit video tier

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-view-set-generation
**Tags:** views, video, comfyui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Orbit/turnaround video tier: dispatch into the video run seam (Wan camera-control workflow through the video-generation epic engine seam; the Director run pipeline is a future peer), with frame extraction post-process (hook pattern, src/generation/hooks/registry.ts) into extracted_frame items with per-frame camera interpolation from the plan. AC: one run produces one orbit asset plus M extracted frame items with monotonic azimuth ordering; long-run honors hold/cancel (src/generation/flow-control.ts); blocked until the video run seam lands - image tiers ship without it.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
