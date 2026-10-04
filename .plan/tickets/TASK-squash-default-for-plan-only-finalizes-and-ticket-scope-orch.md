<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: squash default for plan-only finalizes and ticket-scope orchestration

**Status:** Done
**Scope:** squash default for plan-only finalizes
**Priority:** medium
**Effort:** Small
**Tags:** finalize, orchestration

**Summary:**

Default --merge-strategy squash for plan-only branches; document ticket-scope finalize orchestration. giwt-side: lock narrow, universal 5.5, header resolver, staging-WT, stash deletion, index shard.

**Context:**

Plan-only branches (tickets/epics/backlog/index + generated matrix/code-map) replay every commit in step 5a; one merge would skip the replay. Until giwt ships the header-resolver + staging-WT tickets, default ticket-scope finalizes to `--merge-strategy squash` and document the orchestration: file tickets in a worktree, sync --fix, commit, finalize with squash. Related giwt-side improvement batch (six tickets, all Not Started 2026-10-03): lock-narrow, universal post-merge reconciliation, ticket-header resolver, staging-worktree merge, stash-dance deletion, index sharding.

**Acceptance Criteria:**

- [x] Ticket-scope finalizes default to --merge-strategy squash; documented where agents find it
- [x] Cross-refs to the six giwt tickets resolve after their finalize
- [x] Plan-only finalize stops hitting per-commit replay conflicts

**Resolved:** squash guidance added to AGENTS.md worktree block (squash-default-orchestration branch). Cross-refs: giwt-side improvement batch all Not Started 2026-10-03 - lock-narrow, universal post-merge reconciliation, ticket-header resolver, staging-worktree merge, stash-dance deletion, index sharding (filed, pending implementation).
