<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: runGit VCS seam hardening for future adapters

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Harness shells git directly (runGit in run-context.ts, worktree-scope.ts) and giwt is git-native. Keep one choke point so a future vcs adapter (jj/sapling) is a seam, not a rewrite. Scope: audit + centralize VCS calls, keep test seams; NO jj support (premature). Research: harness-git-integration section 4.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
