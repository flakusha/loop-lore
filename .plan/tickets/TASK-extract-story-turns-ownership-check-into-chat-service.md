<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: extract story-turns ownership check into chat service

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-code-quality
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

DDD rec-1 starter (DDDReview): move story-turns ownership into the chat service; the route becomes a thin adapter. Co-bind: epic-chat-lifecycle-moderation (chat ownership).

**Ground state:** `src/routes/story-turns.ts:26-36` — `checkChatOwnership(database, chatId, userId)` does a direct `database.selectFrom("chats")` + permission check inside a route helper (`:54`, `:113` call sites). Live count: 49 route files with direct `database.(selectFrom|insertInto|updateTable|deleteFrom)` under `src/routes/`. In-repo service precedent: `src/chat/service/*`, `src/characters/services/*`, `src/assets/service/*`.

**Adopt/adapt/defer:** ADOPT strangler-fig service extraction (Fowler; AWS Prescriptive Guidance; Azure Architecture Center — move the decision into the service, keep the route as a thin adapter calling one service method; https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html, https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig). Elysia fit: feature folders with controllers+services+models (https://elysiajs.com/essential/best-practice). DEFER: any new DI framework; big-bang rewrite (strangler per route, starting with the two named starters).

**Acceptance criteria:**

- [ ] `checkChatOwnership` moves to `src/chat/service/` (e.g. `access.ts` beside `checkChatAccess`); `src/routes/story-turns.ts` calls the service and holds zero Kysely imports.
- [ ] Existing story-turns tests green; no behavior change (same allow/deny matrix).
- [ ] Rec-7 non-goal recorded: no entity-class rollout in this ticket.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
