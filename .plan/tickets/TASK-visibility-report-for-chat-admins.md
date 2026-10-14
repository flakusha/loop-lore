<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Visibility report for chat admins

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

**Summary:**

Add GET /api/chats/:id/memory/visibility returning the per-viewer memory-injection list for the latest message, with rejected memories shown for transparency. Reuses shouldInjectMemory in read-only mode. Powers a future admin debug panel; the UI is out of scope.

Source: docs/research/memory-isolation-and-world-timeline.md §3. Parent: IDEA-memory-knowledge-isolation-and-world-timeline.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
