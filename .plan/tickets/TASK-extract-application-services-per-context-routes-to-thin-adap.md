<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: extract application services per context (routes to thin adapters)

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-code-quality
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

DDD recommendation 1 (High impact, Medium risk, 1-2 weeks strangler). Move direct DB logic from src/routes/* into src/chat/service, src/characters/services, src/assets/service, src/nsfw/moderation-service. Routes become thin adapters. Start with src/routes/story-turns.ts ownership check (checkChatOwnership direct Kysely query + permission check inside route helper) and src/routes/chats/turn-skip-routes.ts generation trigger (route decides generation side-effect based on service result and config; orchestration belongs in application service). 78 route files use database. directly (admin, characters, assets controllers) — each migrates behind the service seam; invariants stop being bypassed, tests stop being fragile.

Owner: epic-code-quality (DDDReview correction 2026-10-29: epic-architecture is a vision/status doc with Tickets: _TBD_, not an actionable refactor owner). Co-bind: epic-chat-lifecycle-moderation (chat ownership). Verified: routes own ownership checks, generation triggers, moderation orchestration; chat/service barrel exists but procedural; aggregates lack encapsulation.

Acceptance: story-turns ownership check lives in application service with route as adapter; turn-skip orchestration (incl generation trigger decision) lives in service; no new direct database. usages in migrated routes; migrated paths covered by service-level tests; bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
