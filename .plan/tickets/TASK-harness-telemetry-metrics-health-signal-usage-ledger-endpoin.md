<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness-telemetry-metrics-health-signal-usage-ledger-endpoint

**Status:** Done
**Blocker:** HELD — no implementation lane exists yet; code genuinely unlanded (no `harness` type under `src/telemetry`, no metrics/health mention). Do NOT touch until a lane is scoped.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Give the harness a metrics/health/telemetry signal: exec-log (`exec-log.ts`, recorder/query/stats, `GET /stats`), ledger (`usage-ledger.ts:48-124`, in-memory only, no route), and the `turn_id` correlation are all shipped, but nothing reaches the standard signals — no `harness` type under `src/telemetry`, no `src/routes/metrics.ts` or `src/routes/health.ts` mention, no usage-ledger endpoint, no SSE route. `TASK-harness-stats-dashboard` (Not Started, epic-harness-integration) covers `record()`-path event types + per-model rollups + Analytics sub-block; `TASK-harness-surfacing-exec-log-sse-to-chat-usage-ledger-credit-g` (Not Started) covers SSE-to-chat + credit guard. This ticket is the narrow ACP-side signal: per-profile run/error/latency counters visible to metrics/health.

**Context:**

## Why

Parity matrix gap #7 (PARTIAL) + `TASK-harness-stats-endpoint` precedent (Done ticket whose `GET /stats` route shipped but was never called — a signal nobody reads is not a signal). Operators scaling harness profiles have no in-band way to see failures, breaker trips, or spend; the JSONL requires shell access.

## Scope

- Harness counters (runs, errors by kind, breaker trips, ledger spend) surfaced through the existing telemetry/metrics path — reuse `record()`/collector/health conventions, no new tables, no new infra (same constraint as the stats-dashboard ticket).
- Read path for the in-memory usage ledger (or a decision recorded here that the JSONL + `GET /stats` already covers it).
- Cross-link, do not absorb: `TASK-harness-stats-dashboard` (event types + rollups + Analytics UI) and the SSE surfacing ticket (chat/SSE delivery + credit guard).

## Do NOT touch

- Do NOT duplicate the stats-dashboard event types or the Analytics sub-block.
- Do NOT build chat/SSE delivery (surfacing ticket owns it).

**Acceptance Criteria:**

- [ ] Harness run/error/breaker/spend counters visible via the standard metrics or health surface (no shell/JSONL required).
- [ ] Usage ledger is queryable or an explicit already-covered decision is recorded with pointers.
- [ ] No new tables, no new infra; existing `record()`/collector conventions reused.

**Resolved:** 2026-11-11 registry-driven close: git issue 635eef8 (registry tip: 5f1ea508a Konstantin Fedotov Auto-closed: appended .md marker marks TASK-HARNESS-TELEMETRY-METRICS-H)
