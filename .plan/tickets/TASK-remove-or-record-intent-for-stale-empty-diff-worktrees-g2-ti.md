<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: remove or record intent for stale empty-diff worktrees g2-timeline-branching-ui and plan-mark-tickets-closed

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Both worktrees are parked at dev HEAD 709cee00 with 0 commits ahead and empty diffs vs dev (inventory.md + features section 2 NO-OP). No timeline-branching commits exist on any local branch. Either remove the worktrees/branches or record why they are kept.

Evidence: git rev-parse identical hashes; git log dev..HEAD count 0; git diff stat empty; git status clean.

Acceptance Criteria:

- [ ] both worktrees removed via giwt remove, or intent recorded on this ticket
- [ ] giwt list no longer shows stale entries (or shows them as intentional)

Report: .tmp/glm-review/2026-10-21/inventory.md, features.md section 2.

Caveats: worktree removal only; no code change; coordinate with owners before removing.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
