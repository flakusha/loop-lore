<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: omp adapter

**Status:** Done
**Status Note:** 2026-11-25 reconcile: the omp adapter shipped — `createOmpAdapter` (`src/integrations/harness/omp.ts:75`) is registered in the flavor→factory map (`src/integrations/harness/flavor-factories.ts:30`) and is the reference adapter. The filed premise (no omp adapter) was stale.
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Implement omp RPC adapter driving omp --mode rpc/json via createAgentSession/waitForIdle; map session storage to loop-lore messages. Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
