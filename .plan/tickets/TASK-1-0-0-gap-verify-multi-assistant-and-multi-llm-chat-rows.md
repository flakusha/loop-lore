<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 GAP: verify multi-assistant and multi-LLM chat rows

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

epic-chat-variants-taxonomy.md is Done but variants 6-12 (multi-LLM rows) are NOT verified. Scope: verify or re-open those rows with fixtures. Related: epic-chat-variants-taxonomy.md, epic-group-chat.md. Caveats: TOCTOU: variant rows verified against code at verification time; concurrent variant edits re-trigger verification. Security: multi-LLM routing respects per-model access permissions. Authorization: assistant participation gated by chat inclusion. Parallelism: fixture-driven verification; no shared state. Partial failure: unverified rows re-open individually, verified rows stay closed. Rollback: verification only; no behavior change. Observability: per-row verify/re-open outcome logged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
