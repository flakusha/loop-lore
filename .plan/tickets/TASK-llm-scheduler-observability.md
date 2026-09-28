<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: LLM scheduler observability

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `.plan/epics/epic-llm-request-scheduler.md`
**Summary:** Emits scheduler state onto the existing telemetry surface — queue depth, wait time, admission decisions, and llama-swap rotation events — so a scheduling change is diagnosable from telemetry rather than from a stopwatch.
**Context:** Without this, every later ticket in the epic lands unobservable. A scheduler that reorders traffic is precisely the kind of change that produces "the app feels slow" reports with no signal to explain them.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Per-request scheduling metrics are emitted on the existing telemetry/logging surface (`src/telemetry/`, structured `logger` per the repo convention — no `console.*`):
  - `queueDepth` at enqueue and at dequeue, per provider
  - `queueWaitMs` — time spent waiting for a slot, per request
  - `admit` / `deny` decisions, per provider (denials only after `FEAT-llm-resource-aware-admission-control` lands)
  - `narrow` events on 429-driven cap reduction, per provider
  - `rotate` events with the cost in ms, once `FEAT-llama-swap-rotation-exclusion-policy` lands
- [ ] Metrics reuse the existing per-request correlation id (`attemptId` from the cancellation tracker) so a wait time can be joined to the generation it delayed. Do not mint a second correlation scheme.
- [ ] **A read-only status surface** exposes current queue depth and per-provider in-flight/queued counts, on the existing generation-status route family rather than a new top-level route. `GET /api/v1/generation/active` (`src/generation/controller.ts:96`, handler `handleListActiveGenerations`) is the natural host — extend it, do not fork it.
- [ ] No admin *control* surface here (pause, limit adjustment, cancel-all) — that is `TASK-admin-generation-controls` in `epic-generation-flow-control.md`. Read-only only.
- [ ] Queue depth is a gauge sampled on enqueue/dequeue, not a cumulative counter — a monotonic counter cannot answer "how deep is the queue right now".
- [ ] The `llmRequestStateMachine` states (`pending`/`queued`/`scheduled`/`generating`/`paused`/terminals, `src/llm/message-state-machine.ts:37-59`) are reflected in the emitted state field, so the wire format and the state machine do not drift apart.
- [ ] Tests cover: metric emission on enqueue/dequeue/admit/deny, and the status route returning non-zero depth under load.
- [ ] `bun run check` green.

## Notes

**Read-only on purpose.** Adding scheduler controls here would create a second admin path alongside `TASK-admin-generation-controls` in the sibling epic, and two paths to the same switch always disagree. This ticket observes; that ticket controls.

**Extend `/api/v1/generation/active`, do not fork it.** A new scheduler-status route duplicates the existing active-generation view and gives clients two endpoints whose numbers can disagree under load. Extending the existing route keeps one source of truth.

**Join on the existing id.** The generation already carries an `attemptId` through cancellation tracking and telemetry. A scheduler-specific correlation id would need its own propagation and would eventually diverge from the one the frontend already logs against.

## Related Files

- `src/telemetry/` — existing metrics surface
- `src/logger/` — structured logging convention
- `src/llm/message-state-machine.ts:37-59` — state enum to mirror
- `src/generation/cancellation-manager/` — `attemptId` source
- `src/llm/resource-manager.ts` — where enqueue/dequeue happen
- `.plan/epics/epic-llm-request-scheduler.md` — parent epic


git issue: 1051b53
