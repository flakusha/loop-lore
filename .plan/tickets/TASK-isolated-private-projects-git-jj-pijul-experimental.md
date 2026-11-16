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

Isolated single-user private projects with a selectable VCS backend: git stable, jj experimental, pijul experimental. Backend choice sits behind the existing VCS seam and defaults to git; experimental backends are clearly labelled and fenced off from multi-user paths.

Explicitly NOT building:

- Multi-user collaboration on any backend (pijul-collab ticket).
- Shared multi-worktree projects (shared-git ticket).
- Migration between backends in v1.
- Promoting jj or pijul out of experimental status.

**Context:**

Private projects must stay single-user and isolated while letting jj and pijul mature behind an experimental flag. Reuse the existing VCS seam; add no second abstraction. Related: epic-harness-integration.md.

**Acceptance Criteria:**

- [ ] New private project defaults to the git backend with unchanged behavior.
- [ ] jj and pijul backends available behind an experimental flag with clear labelling.
- [ ] Experimental backends cannot be attached to multi-user or shared paths.
- [ ] Tests passing, documentation updated.
