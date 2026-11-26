<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP composition root wiring

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

G1 evidence (resolved 2026-11-22): the composition root shipped — `createHarnessRuntime` (`src/integrations/harness/runtime.ts:248`) constructs registry+selector+usage-ledger+profile-breaker once and is initialised in production (`src/integrations/harness/runtime.ts:308`), wired from `src/server/start.ts:56,93,310` beside `initHarnessAdminSettings`. The filed premise ("no composition root on dev", "the outbound ACP client stack is dead code at runtime") was stale (review G1, .tmp/research/harness-acp-implementation-review-2026-11-03.md:182). The factory is called from src/server/start.ts beside initHarnessAdminSettings behind harness.acp.enabled (default false); harness routes consume the shared runtime instead of standalone surfaces with no response-shape or gating-semantics changes. AC: greps for new ProfileSelector | new ProfileRegistry | createHarnessDriver | registerHarnessDriver over src/ hit production construction (not only tests); spawn path passes through assertHarnessExecution; disabled-by-default posture preserved (no construction when harness.acp.enabled is false); one admin-gated consumer can complete a turn against the fake-ACP fixture. Dependencies: blocks TASK 369e695 (effective settings view) which blocks 137cfa0 (ToS scoping).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete — composition root + boot wiring shipped (`src/integrations/harness/runtime.ts:248,308`, `src/server/start.ts:56,93,310`)
- [ ] Tests passing
- [ ] Documentation updated
