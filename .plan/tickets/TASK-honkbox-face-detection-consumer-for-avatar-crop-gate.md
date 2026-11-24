<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Honkbox face-detection consumer for avatar crop gate

**Status:** Blocked
**Priority:** Medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: HONKBOX_FEATURE_KEYS plus capabilities parse plus face step in emotion-avatar-service before runBatchGeneration (detect, crop-align, named reject on no-face). AC: 501 or absent flag keeps current manual path byte-identical. Depends: honkbox T1 FaceDetection RecKind.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
