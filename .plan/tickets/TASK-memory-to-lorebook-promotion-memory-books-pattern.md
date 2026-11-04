<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Memory to lorebook promotion (Memory Books pattern)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Tags:** memory, lorebook, research-gap
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Agnai Memory Books lesson (research 01/03): keyword entries with priority (admission) + weight (placement), depth/contextLimit budgets, one-click promote chat memory to lorebook entry. Check promote-lore.ts coverage first (event-to-lore exists); gap is the user-facing one-click promote + priority-vs-weight split. Research: .tmp/research/ai-cheat/01-outside-takes.md gap 4, 03-expanded-takes.md section 2. Merged from dupe TASK-memory-to-lorebook-one-click-promote (d485b75, closed): ST promotion is manual everywhere (DeepWiki vectors ext can include World Info but promotion stays manual) — differentiator stands; scope as assistant command or chat action over a summary/message range with keys auto-suggested and user confirm before insert; reuse inclusion-group admission + activation scoring (epic-lorebook-inclusion-groups).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
