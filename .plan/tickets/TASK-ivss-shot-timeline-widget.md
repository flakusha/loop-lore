<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS shot timeline widget

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, frontend, timeline
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

vis-timeline-based shot timeline (reorder, timestamp edits, status chips) plus WebCodecs/mp4box.js preview trim on generated clips. AC: reordering and timestamp edits persist; a preview trim never re-encodes server-side (keyframe-aligned remux, or the clip is marked needs-server-render).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
