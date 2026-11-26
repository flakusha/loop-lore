<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: runGit VCS seam hardening for future adapters

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Harness shells git directly (runGit in run-context.ts, worktree-scope.ts) and giwt is git-native. The VCS seam lands in `giwt` (`TASK-vcs-backend-interface-and-git-adapter`); loop-lore's `runGit` stays a thin read-side helper with a scrubbed git env and explicit cwd, and must not grow a second backend abstraction. Scope: audit + centralize VCS calls, keep test seams; NO jj support (premature). Research: harness-git-integration section 4.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
