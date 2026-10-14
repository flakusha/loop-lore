<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Memory snapshot/restore with world-state version

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

**Summary:**

Bind a memory to a world_version snapshot so branched chat sessions (TASK-world-state-management) do not leak across realities. Add memory.world_version: int; injectMemories filters by world_version <= viewer.world_version; migration adds the column and back-fills with the current head version.

Source: docs/research/memory-isolation-and-world-timeline.md §3. Parent: IDEA-memory-knowledge-isolation-and-world-timeline.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
