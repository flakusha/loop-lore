<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: giwt finalize instructs a forbidden dev-checkout action

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-tooling-improvement
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

When the dev checkout has staged-but-uncommitted entries, giwt finalize exits 1 with an instruction to run git commit or reset on the dev checkout. That instruction contradicts AGENTS.md: agents MUST NOT mutate the dev checkout outside an isolated worktree. The tooling should refuse with a non-forbidden recovery path or provide a giwt-native resolution. Observed: 17 staged lint-nits blocked giwt finalize provider-integrations.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 1563a62 (registry tip: a3647499e Konstantin Fedotov Close issue)
