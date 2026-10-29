<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS annotations surface

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, annotations, collaboration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Annotation rows (target_type+target_id, author, time range, region JSON, body, resolved) plus UI on scenes/shots/assets: time-range highlight, region overlay, resolve. AC: two users can annotate the same clip concurrently without data loss; the per-scenario annotation list is exportable as review notes.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
