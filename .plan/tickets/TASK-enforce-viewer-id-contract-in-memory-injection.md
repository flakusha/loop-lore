<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Enforce viewer-id contract in memory injection

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

**Summary:**

Make shouldInjectMemory/evaluateShareability callsite-fail without an explicit viewerId argument. Change injectMemories to require viewerId: string and update every caller (assistant chat, group chat, NPC chat, summarizer, audit log, memory replay). Add a unit-test gate rejecting a caller that omits viewerId.

Source: docs/research/memory-isolation-and-world-timeline.md §3. Parent: IDEA-memory-knowledge-isolation-and-world-timeline (design closed as design-complete).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
