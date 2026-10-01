<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Link memories to world-timeline events

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-memory-knowledge-systems

**Summary:**

Add a world_event_id FK from memory rows to src/story/timeline/world-timeline.ts entries. Migration: nullable column; back-fill from heuristics for recent memories. provisionMemories accepts an optional worldEventId; system callers wire it from chat-event listeners. A timeline rewind (TASK-world-time-sync-wait-and-chat-branch-merge) invalidates memories linked to events that no longer happened.

Source: docs/research/memory-isolation-and-world-timeline.md §3. Parent: IDEA-memory-knowledge-isolation-and-world-timeline.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
