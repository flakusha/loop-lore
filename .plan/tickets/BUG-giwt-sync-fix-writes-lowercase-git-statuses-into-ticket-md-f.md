<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: giwt sync --fix writes lowercase git statuses into ticket .md files, breaking the status-vocab gate

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Repro: run `giwt sync --fix` on a branch where git issues carry lowercase status strings (e.g. 'done'). The fixer copies the git-issue status verbatim into the ticket .md **Status:** line instead of mapping it into the plan status vocabulary (Not Started, In Progress, Blocked, Done, Wontfix, Postponed).

Observed 2026-10-01 on worktree tree/gallery-dedup-tickets: sync --fix rewrote 19 ticket files to '**Status:** done', and the immediately following `giwt plan validate` failed status-vocab with 19 errors. `giwt plan validate --fix` had to repair all 19 afterwards, so the two fixers disagree and the first one leaves the tree in a non-committable state.

Impact: every agent that runs sync --fix as the documented remedy for a 'Status mismatches' finding immediately produces a red gate, converting an advisory reconciliation into a blocking failure requiring a second fix pass.

Fix: map the git-issue status onto the plan vocabulary in sync --fix rather than copying it (done -> Done, open -> Not Started, etc.), or have sync --fix delegate to the same normaliser plan validate --fix uses. Add a regression asserting sync --fix leaves status-vocab green.

Evidence: tree/gallery-dedup-tickets/.tmp/run-78380-muozumma/check-fail-plan-ticket-index-sync.log followed by giwt plan validate output listing 19 status-vocab errors.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
