<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: remove or record intent for stale empty-diff worktrees g2-timeline-branching-ui and plan-mark-tickets-closed

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** (none — hygiene/self-contained)
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Scope extension 2026-10-23 (plan/epic audit + assistant integration review):**

- `feat-classifier-template-packs` worktree: 0 commits ahead of dev (empty-diff,
  same class as g2-timeline-branching-ui) — remove or record why it exists.
- `fix/img2img-workflow-and-input-image-upload`: stale-absorbed — tip is NOT an
  ancestor of dev (`git merge-base --is-ancestor` rc=1); only ticket-status lines
  diverge. Finalizing merges nothing of value — remove or re-ticket.
- Four ledger ghosts with no branch, worktree, or ticket (record intent or drop
  from the shared ledger): `actor-memory-emotion-impact`, `chat-branch-regex-detect`,
  `coordination-priority-eviction-fix`, `plan-classifier-packs-translator`.

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
