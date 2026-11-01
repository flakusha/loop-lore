<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: RSI isolation test matrix

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-rsi-repo-access
**Tags:** rsi, testing
**Depends on:** `TASK-agent-api-boundary-capability-enforcement`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Isolation matrix: user cannot reach repo root; external agent cannot reach a sibling worktree; internal-service can finalize. Plus regression: the scope guard still denies escape per kind.
Parallel-safe resource contract (amendment A10): one child process / :memory: SQLite per test, afterEach teardown, unique principals per test, documented resource-contract comments (repo precedent: fake-acp-server.ts:12-15, register-plugins.governance.test.ts:15-17).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Isolation matrix: user cannot reach repo root; external agent cannot reach a sibling worktree; internal-service can finalize
- [ ] Regression: scope guard still denies escape per kind
- [ ] Parallel-safe resource contract (one child/:memory: DB per test, afterEach teardown, unique principals, resource-contract comments)
