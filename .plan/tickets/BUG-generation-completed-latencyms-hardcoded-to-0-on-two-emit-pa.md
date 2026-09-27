<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: generation.completed latencyMs hardcoded to 0 on two emit paths

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-analytics-observability
**Summary:** Two of three `generation.completed` emitters record `latencyMs: 0`, so admin `avgLatencyMs` aggregates are wrong.
**Context:** Found 2026-09-27 during LLM execution-stats analysis. `src/routes/analytics.ts:78,139` averages `json_extract(event_data, '$.latencyMs')`; E10 latency percentiles build on the same field.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Related:** FEAT-admin-analytics-latency-p50-p95-p99-trends-sse-live-push-cha, src/routes/analytics.ts, src/api-governance/telemetry/collector.ts

## Summary

`generation.completed` events carry a hardcoded `latencyMs: 0` on the auto-gen post-store path and the streaming path. Only the non-streaming generate-route path records wall-clock latency. Every admin aggregate over `latencyMs` (`GET /api/analytics/chat/:chatId`, `GET /api/analytics/overview`) therefore under-reports, and any E10 percentile work built on this field inherits the corruption.

## What

- `src/generation/auto-gen/post-store.ts:155` — `latencyMs: 0` in `applyPostStoreEffects` (`generation.completed`). No start timestamp is threaded through `PostStoreOpts`, so the value cannot be real.
- `src/generation/generate-route/stream-to-client.ts:241` — `latencyMs: 0` in the completed branch. `streamToClient` owns the stream lifetime and can measure it, but does not.
- Control: `src/generation/generate-route/non-stream.ts:178` records `latencyMs: Date.now() - startedAt` — the correct pattern to copy.
- Consumers: `src/routes/analytics.ts:78,139` (`avgLatencyMs` always dragged toward 0 for auto-gen + streamed generations, the two dominant paths).

## Why

Latency is the base unit for E10 (p50/p95/p99 trends). Shipping percentile aggregation over a field that is 0 on most rows produces a dashboard that looks precise and is wrong. Fix the source data first; E10 then aggregates truthfully.

## Scope

- Thread a `startedAtMs` (or equivalent) into `applyPostStoreEffects` opts from the `callLlm` call site in `src/generation/auto-gen/auto-generation.ts`, and record `Date.now() - startedAtMs` instead of 0.
- Capture stream start in `streamToClient` and record elapsed latency in the `generation.completed` branch (keep `generation.truncated` without latency — no full delivery, no billing).
- Regression test: seed/fixture a completion through each path and assert `latencyMs >= 0` and (with a controllable clock or generous lower bound) non-trivial; assert analytics `avgLatencyMs` reflects recorded values.
- Out of scope: percentile aggregation itself (E10 ticket), alerting (E11), per-model pricing (separate ticket).

## Acceptance Criteria

- [ ] `generation.completed` from post-store and stream-to-client carries measured wall-clock `latencyMs`
- [ ] `generation.truncated` shape unchanged (no latency field, no billing)
- [ ] Analytics `avgLatencyMs` reflects recorded values in a seeded fixture test
- [ ] `bun test src/generation/ src/routes/analytics.test.ts` green
