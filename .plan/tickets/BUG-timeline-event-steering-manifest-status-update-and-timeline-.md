<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Timeline event steering: manifest status update and timeline append are not atomic

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-timeline-system

**Summary:**

Location: src/story/timeline/event-steering.ts:196-212.

Evidence: updateTable(world_event_steerings).set(status: Manifested, resolved_at: now) at :196-200 and appendTimelineEvents at :202-212 are two separate awaits on the raw db handle with no transaction. A crash between the two marks the steering Manifested while the timeline event is lost.

Verification: CODE-READ - event-steering.ts:196-212 re-read this session (two independent awaits, no transaction). The crash-window execution is infeasible read-only; the statement sequence is fully determined by the read.

Impact: a manifested steering with no timeline event - downstream consumers see the steering as done while the narrative event never happened.

Fix: wrap the status update and appendTimelineEvents in one db.transaction().

Source: .tmp/glm-review/deep-story-crypto-1015.md F-11 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 31fd00f (registry tip: 036518af0 Konstantin Fedotov Close issue)
