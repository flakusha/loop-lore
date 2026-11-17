<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: isolated-private-projects-git-jj-pijul-experimental

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-remote-harness-federation.md
**Tags:** harness, federation, vcs
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Isolated single-user private projects with a selectable VCS backend: git stable, jj experimental, pijul experimental. Backend choice sits behind the VCS seam owned by the `giwt` CLI (`TASK-vcs-backend-interface-and-git-adapter`) and defaults to git; until that seam lands this ticket is a research spike and ships no jj or pijul backend in loop-lore, and experimental backends are clearly labelled and fenced off from multi-user paths.

Explicitly NOT building:

- Multi-user collaboration on any backend (pijul-collab ticket).
- Shared multi-worktree projects (shared-git ticket).
- Migration between backends in v1.
- Promoting jj or pijul out of experimental status.

**Context:**

Private projects must stay single-user and isolated while letting jj and pijul mature behind an experimental flag. The VCS seam is being created in the `giwt` CLI (`TASK-vcs-backend-interface-and-git-adapter`); loop-lore consumes it and adds no second abstraction, so jj and pijul work in this repo stays a research spike until the seam lands. Related: epic-harness-integration.md.

**Acceptance Criteria:**

- [ ] New private project defaults to the git backend with unchanged behavior.
- [ ] jj and pijul backends available behind an experimental flag with clear labelling.
- [ ] Experimental backends cannot be attached to multi-user or shared paths.
- [ ] Tests passing, documentation updated.
