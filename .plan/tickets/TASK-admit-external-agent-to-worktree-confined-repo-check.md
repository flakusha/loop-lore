<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: admit external agent to worktree confined repo check

**Status:** Done
**Status Note:** 2026-11-25 reconcile: the worktree-confined repo-check surface shipped — `src/agent/api/worktree.ts`, `src/agent/api/check.ts` and `src/agent/api/sandbox.ts` are mounted through `agentApiRoutes` (`src/agent/api/router.ts:110-111`) inside the v1 standalone surface (`src/routes/v1/standalone-surface.ts:56`). The filed premise (no own-worktree check) was stale.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-rsi-repo-access.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The external agent harness is intentionally denied repo.check, but it now has an op-scoped grant model and a worktree resolver. A narrow, server-derived exception can enable self-repair without granting path or argv control.

**Evidence (dev 2026-11-18):** report 11; grants and resolver shipped; authz and gate still hard-deny external-agent repo.check; worktree scope is computed but unused.

**Scope:** permit check:run for the external-agent op only when the worktree is derived server-side; accept no request path or argv from the caller; add parallel-safe tests; keep internal-service behavior unchanged.

**Acceptance Criteria:**

- [ ] external-agent can run check:run in its own worktree
- [ ] arbitrary paths and argv remain rejected
- [ ] repo.write and repo.apply stay denied
- [ ] tests isolate instance state

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
