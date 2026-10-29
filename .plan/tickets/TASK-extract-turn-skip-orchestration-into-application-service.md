<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: extract turn-skip orchestration into application service

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-code-quality
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

DDD rec-1 starter (DDDReview): move the turn-skip advance/generation orchestration into an application service. Co-bind: epic-actor-turn-skip (turn-skip owner).

**Ground state:** `src/routes/chats/turn-skip-routes.ts:62-95` — the route calls `recordTurnSkip` (good, service) then OWNS the orchestration decision: `if (mode === "advance" && !deduped && llmConfigured(config)) void trigger({...})`; generation trigger lives in transport. Seam exists for extraction: `:39-45` already inject `isLlmGenerationConfigured`/`triggerAutoGeneration` as `opts` seams (testability-motivated per the `src/routes/messages/reply.ts` comment) — the decision logic just has not moved down a layer.

**Adopt/adapt/defer:** ADOPT strangler-fig extraction with the existing `opts`-injection seam pattern; routes keep auth/validation/HTTP mapping only (https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html, https://elysiajs.com/essential/best-practice). Explicit non-goal: fire-and-forget stays — the outbox migration is a separate ticket (generation-transactional-outbox), not this one.

**Acceptance criteria:**

- [ ] New `advanceTurnWithGenerationIfConfigured`-style service owns `recordTurnSkip` + `llmConfigured` + trigger decision; route only maps HTTP↔service result (404/409/403 mapping preserved).
- [ ] `turn-skip-routes.test.ts` seam tests move to service tests.
- [ ] Rec-7 non-goal recorded: no entity-class rollout in this ticket.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
