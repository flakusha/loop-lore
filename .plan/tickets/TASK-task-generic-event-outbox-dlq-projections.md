<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TASK-generic-event-outbox-dlq-projections

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-workflow-engine

**Summary:**

Owner epic: `.plan/epics/epic-workflow-engine.md`

## Background

- Durable precedent: `src/db/migrations/038_mesh_outbox.ts:19-44` (`mesh_outbox`: id, target_origin, content_id, envelope, attempts, status pending|done|dead, next_attempt_at; unique `(target_origin,content_id)`; no FKs by design).
- Sender retry: `src/federation/outbox.ts:24-29` (`MAX_ATTEMPTS=8`, `BASE_BACKOFF=60s`, `BATCH=25`); upsert shape at `:43-68`.
- In-process bus is volatile: `src/plugins/event-bus.ts:28-46` (no persistence/retry/ordering). Counterexample: `src/routes/export-sse/jobs.ts:21-27` (in-memory Map, lost on restart - the gap this fixes).
- Missing (grep-negative): no generic `event_outbox`, no DLQ/poison classification, no admin replay, no projections.

Established solutions: Watermill Forwarder transactional-outbox pattern (write row + outbox row in one tx, async drain) - https://watermill.io/advanced/forwarder/ ; outbox design reference (tx boundaries, effectively-once via dedup) - https://academy.threedots.tech/knowledge/outbox/ . Watermill Go-only (pattern only, no dep); full CQRS/ES DEFERRED (SQLite single-writer overkill).

## Change

1. Migration `0xx_event_outbox`: id, topic, event_type, payload JSON, idempotency_key UNIQUE, status pending|done|dead, attempts, next_attempt_at, created_at; indexes `(status,next_attempt_at)`, `(topic)`. `mesh_outbox` untouched.
2. `src/events/outbox.ts`: `enqueueOutbox()` (INSERT OR IGNORE on idempotency_key); `drainOutbox()` (batch 25, exp backoff, 4xx/error-tag immediate dead poison fast-path, else retry to 8); `markDone/markDead` helpers. Reuses `outbox.ts:43-68` shape.
3. Two projections with `rebuild()`: `actor_knowledge` (from memory.extracted/lore.revealed), `chat_summary` (from message.posted burst); `bun run projections:rebuild <name>` + cron nightly verify.
4. Admin: `GET /api/admin/outbox?status=dead` + `POST /api/admin/outbox/:id/requeue` (status-pending, attempts=0).

## Acceptance

- Enqueue same idempotency_key twice yields 1 row.
- Failing consumer retries with backoff then lands `dead` after 8; 4xx-class error dead on first pass.
- Dead row requeue via admin route redelivers exactly once.
- `rebuild(actor_knowledge)` from empty table reproduces identical rows.
- Kill/restart mid-queue loses 0 events.

**Caveats:** TOCTOU: claim-then-process rows in one statement so parallel drains never double-deliver. Security: admin requeue moderator-only; payload JSON never executed. Parallelism: single drain owner per topic; SQLite single-writer. Partial failure: poison fast-path classifies, records error tag. Rollback: new table + module only; drain tolerates missing handlers. Idempotency: consumers keyed on idempotency_key. Observability: drain lag, dead-letter count, per-topic throughput in telemetry.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
