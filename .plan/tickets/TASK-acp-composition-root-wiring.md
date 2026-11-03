<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP composition root wiring

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

G1 evidence: ProfileRegistry, ProfileSelector, UsageLedger and ProfileBreaker are constructed only in tests (src/integrations/harness/flavor-factories.ts:9-10 states there is no composition root on dev); the only boot touchpoint is initHarnessAdminSettings at src/server/start.ts:23, so the outbound ACP client stack is dead code at runtime (review G1, .tmp/research/harness-acp-implementation-review-2026-11-03.md:182). Fix direction: a single factory (createHarnessRuntime or equivalent) in src/integrations/harness constructs registry+selector+usage-ledger+profile-breaker once at boot, called from src/server/start.ts beside initHarnessAdminSettings behind harness.acp.enabled (default false); harness routes consume the shared runtime instead of standalone surfaces with no response-shape or gating-semantics changes. AC: greps for new ProfileSelector | new ProfileRegistry | createHarnessDriver | registerHarnessDriver over src/ hit production construction (not only tests); spawn path passes through assertHarnessExecution; disabled-by-default posture preserved (no construction when harness.acp.enabled is false); one admin-gated consumer can complete a turn against the fake-ACP fixture. Dependencies: blocks TASK 369e695 (effective settings view) which blocks 137cfa0 (ToS scoping).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
