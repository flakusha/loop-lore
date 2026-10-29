<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS video metadata extractor

**Status:** Not Started
**Priority:** medium
**Effort:** Small-Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, assets, metadata
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Duration/fps/resolution extraction for video assets extending src/assets/metadata.ts (cross-listed in the multimodal-asset-reuse annex); cached at write, consumed by GET /api/assets/:id/generation-context. AC: an uploaded or ingested video exposes duration + fps via the asset metadata API; no ffmpeg process spawn per read (cached at write); binary absence degrades gracefully.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
