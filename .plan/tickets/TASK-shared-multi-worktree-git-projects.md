<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: shared-multi-worktree-git-projects

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-remote-harness-federation.md
**Tags:** harness, federation, git
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

One project spanning many worktrees over git with shared history. The project root owns the git dir, worktrees attach to it, and history is visible across worktrees using plain git semantics with no new VCS abstraction.

Explicitly NOT building:

- jj or pijul backends (isolated-private ticket covers those).
- Multi-user merge coordination beyond what git already provides.
- Cross-machine sync (transport is the remote-TLS ticket).
- A second history store beside git.

**Context:**

Companion to the isolated-private and owner-root tickets under the remote/federation harness epic. Shared history must keep working with the existing worktree plus giwt flow. Related: epic-harness-integration.md.

**Acceptance Criteria:**

- [ ] Multiple worktrees attach to one project root sharing one git history.
- [ ] Log and history views span worktrees of the same project.
- [ ] Existing giwt worktree flow keeps working unchanged.
- [ ] Tests passing, documentation updated.
