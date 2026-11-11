<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness multi-agent turn queue

**Status:** In Progress
**Priority:** low
**Effort:** Medium
**Epic:** epic-harness-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Assistant-class participant turns plus detached-job parallelism: sequential turn assignment, parallel computation (CrewAI-style). Distinct from the shipped character turn selection in src/group-chat/turn-selector.ts. DEFERRED until subagent-branch runs (Option C) exist; no multi-assistant code exists today.

**Context:**

Delivered slice (2026-11-11, branch `orchestration-queue`): the harness-profile turn queue — the operator-facing half of this ticket that does NOT depend on Option C subagent-branch runs. Still open: the assistant-class-participant flavor (group-chat Option C) and the `delegate_task` tool (TASK-harness-subagent-delegation).

What landed:

- `harness_queue_turns` table (migration `100_harness_queue_turns`): `batch_id` groups one enqueue; `status` is the row state machine (queued → running → completed | failed | cancelled; `HarnessQueueTurnStatus`); FKs cascade on chat/actor/user delete.
- Service `src/integrations/harness/queue.ts` (rows in `queue-store.ts`, read model in `queue-views.ts`): bounded concurrency (default 2 in flight), exactly ONE in-flight turn per profile, FIFO enqueue order, enqueue-time principal snapshot (`requested_by`/`requested_role`) re-presented to the isolation gate at dispatch time — a policy flip between enqueue and run fails the turn instead of widening access.
- Crash safety: boot recovery (`initHarnessTurnQueue` in `src/server/start.ts`) fails `running` rows `interrupted` (no ACP session survives a restart), then pumps so `queued` rows resume; the claim is single-writer (one server process) with a status-re-checking UPDATE, and `idle()` exposes the drain seam.
- Failure semantics: terminal — `error_code` records the dispatch refusal (`harness_disabled | role_denied | profile_unknown | turn_failed | interrupted`, `HarnessQueueErrorCode`); no automatic retry, re-enqueue is the explicit retry; `attempts` counts claims for observability, not a retry budget.
- Admin surface `src/routes/harness/queue.ts`: `POST /api/v1/harness/queue` (enqueue a batch), `GET /api/v1/harness/queue` (`?batchId=`, `?limit=`), `POST /api/v1/harness/queue/turns/:id/cancel` (queued only — a running turn has a live harness process behind it and answers 409); admin-gated like the harness surface, 503-inert when the integration is disabled; wire schemas in `src/frontend/alpine/admin-harness-schema.ts`.
- Tests: `src/integrations/harness/queue.test.ts` (completion/attribution, per-profile serialization + fan-out, terminal failure codes, cancel, crash recovery, singleton, one real-dispatch end-to-end) and `src/routes/harness/queue.test.ts` (authz, 503-inert, enqueue/list/cancel round-trip). `typecheck - backend` + `lint - eslint` gates green; `scripts/check-file-size.ts --strict` green.

**Acceptance Criteria:**

- [ ] Implementation complete — the assistant-participant flavor (Option C) remains open
- [ ] Tests passing — full-ticket criteria not yet met
- [ ] Documentation updated — full-ticket criteria not yet met

Slice-level acceptance for the DELIVERED harness-profile queue (2026-11-11, `orchestration-queue` @ 8b2cad102), with evidence:

- [x] Queue-slice implementation complete (surfaces listed above; dispatchHarnessTurn unchanged)
- [x] Queue-slice tests passing: `bun test src/integrations/harness/queue.test.ts src/routes/harness/queue.test.ts` → 16 pass / 0 fail; touched-dir sweep `bun test src/integrations/harness src/routes/harness src/db` → 932 pass / 0 fail (incl. schema-sync over migration 100)
- [x] Queue-slice docs updated: CHANGELOG `## [Unreleased]`, epic-harness-integration task row annotated
- [x] Gates: `bun run check --gates "typecheck - backend,lint - eslint"` → PASS both (run 3176895-mwc8buuh); `scripts/check-file-size.ts --strict` → PASS

The three top-level criteria flip only when the assistant-participant flavor (Option C) and any delegated follow-ups (TASK-harness-subagent-delegation) land.
