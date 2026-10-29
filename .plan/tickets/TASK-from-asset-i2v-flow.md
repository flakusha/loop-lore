<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: From-asset i2v flow

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-multimodal-asset-reuse
**Tags:** video, assets, lineage
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Gallery image to i2v continuation via the video-generation workflow tiers (from-asset API + the i2v templates): pick an existing asset, generate a continuation clip, persist with lineage back to the source image. Blocked until the video workflow tiers land in the video-generation epic. AC: a from-asset i2v run produces a clip asset lineage-linked to the source image and visible from the gallery asset page.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
