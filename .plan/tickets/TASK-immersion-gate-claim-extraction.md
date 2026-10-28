<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: immersion gate claim extraction

**Status:** Not Started
**Priority:** high
**Epic:** epic-immersion-consistency-gate
**Tags:** immersion
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

WI-1 of epic-immersion-consistency-gate: detect movement/skill/item/action claims in the actor message by reusing the deterministic src/regex/ extraction pipeline (aux-pipeline enrichment only where opt-in). Output feeds the deterministic rule engine (WI-2). See .plan/epics/epic-immersion-consistency-gate.md.

**Context:**

No fiction-consistency checking of actor input exists; the gate needs structured claims before rules can run. Constraints: deterministic regex path must stay fast (<50 ms p95 added); aux enrichment is opt-in only.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
