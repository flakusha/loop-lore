<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS run validation gate

**Status:** Not Started
**Priority:** medium
**Effort:** Small-Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, validation
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Mode-vs-reference compatibility, reference lane ceilings, trim ranges, audio-needs-visual, and frames-vs-duration (24 fps x2 math) checks enforced before any upload or submit. AC: an invalid scene fails with the named constraint BEFORE any upload/submit; every rule is unit-tested against Director and Wan limits.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
