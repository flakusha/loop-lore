<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 GAP: verify multi-assistant and multi-LLM chat rows

**Status:** In Progress
**Status Note (2026-11-18):** Verification corrected the premise: all twelve variants are declared and selectable (`src/chat/types/variants.ts:83-216`, `src/frontend/pages/new-chat/entry-point.ts:19-32`) and per-actor model overrides exist. Genuinely open: `gm_config.validation.harness` has a prompt consumer but no way to set it — filed as `TASK-expose-validation-harness-name` — and the participant picker still has no actor-kind filter.
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Variants 6-12 are declared and selectable; the open legs are the inert `gm_config.validation.harness` value (filed separately) and the missing actor-kind filter in the participant picker. Related: epic-chat-variants-taxonomy.md, epic-group-chat.md, `TASK-expose-validation-harness-name`. Caveats: TOCTOU: variant rows verified against code at verification time; concurrent variant edits re-trigger verification. Security: multi-LLM routing respects per-model access permissions. Authorization: assistant participation gated by chat inclusion. Parallelism: fixture-driven verification; no shared state. Partial failure: unverified rows re-open individually, verified rows stay closed. Rollback: verification only; no behavior change. Observability: per-row verify/re-open outcome logged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
