<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: transactional outbox for generation side effects (replace fire-and-forget)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

DDD recommendation 5 (Medium impact, Medium risk, 1-2 weeks). Replace fire-and-forget triggerAutoGeneration (void trigger in turn-skip route and message reply; only regenIdempotencyKey as idempotency) with queued job + idempotency key; reuse src/async offload infra. Transactional boundaries today: some routes/services use database.transaction() (auth/register.ts, admin comfyui-workflows flags.ts); many multi-write flows not clearly transactional (chat turn skip cues generation fire-and-forget; moderation actions + audit pair uses trx). Note overlap: TASK-task-generic-event-outbox-dlq-projections.md owns the generic event-outbox/DLQ/projection machinery (Watermill Forwarder pattern, full CQRS/ES deferred); this ticket owns the generation-trigger migration onto that machinery (queued triggerAutoGeneration + idempotency key), consuming it rather than rebuilding it.

Acceptance: turn-skip + message-reply generation triggers go through queued job with idempotency key; duplicate delivery safe; failure retries via queue not lost; outbox drains; bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
