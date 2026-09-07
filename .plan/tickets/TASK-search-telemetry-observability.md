<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Search Telemetry & Quota Observability

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low
**Type:** Feature Task (observability)
**Tags:** search, telemetry, observability, metrics, quota, cost
**Epic:** epic-analytics-observability.md, epic-rag-evaluation-observability

## Summary

Ship structured telemetry for every search invocation: per-mode latency, hit counts, encrypted-match rate, retry counts, rate-limit denials, cost (for paid providers), and quota burn. Surfaces in admin observability dashboards + feeds into existing alerting.

## Why this task exists (the gap)

The user explicitly asked for "configurable request time capping - global, admin, user, etc" and "correct rate limits" — but without telemetry, neither is observable. Today search telemetry is implicit (`log().info("Message search", {...})` in `src/routes/message-search/index.ts:188`); no metrics roll-up.

## Design

### Events

```ts
// src/search/telemetry.ts
export interface SearchTelemetryEvent {
  kind: "search.invocation";
  ts: number;
  userId: string;
  scope: SearchScope["kind"];
  mode: SearchMode;
  q: string;                // first 64 chars; full text never logged
  hitCount: number;
  totalMs: number;
  encryptedMatches: number;
  rateLimited: boolean;
  retried: number;
  provider?: string;
  costUsd?: number;
  quotaBefore?: number;
  quotaAfter?: number;
  cacheHit: boolean;
  visibility: Visibility;
}
```

Emitted to existing structured-logging pipeline (`src/logger/`) — reuses logger's child-context + transport routing. Adds `search` channel.

### Aggregations

- `bun run observability:search` — CLI roll-up: per-mode p50/p95 latency, hit rate, encrypted-match rate, retry rate, top denials.
- Admin `/admin/observability/search` — dashboard page with sparkline charts.

### Quota observability

- Per-user quota burn rate (queries/hour, results returned)
- Per-provider cost (USD/day) for paid providers
- Rate-limit denials grouped by reason (`429`, `403`, `timeout`)

## Files

- `src/search/telemetry.ts` — `recordSearchEvent`, `SearchTelemetryEvent`
- `src/observability/search.ts` — roll-up CLI + dashboard endpoints
- `src/frontend/pages/admin-observability-search.ts` — dashboard page
- `src/observability/search.test.ts` — unit tests for event shape + aggregations

## Acceptance Criteria

- [ ] Every search invocation emits `search.invocation` event
- [ ] Aggregations cover latency, hit rate, encrypted-match rate, retries, denials
- [ ] Per-provider cost rolled up for paid providers
- [ ] Admin dashboard renders sparklines; design-token aligned
- [ ] Roll-up CLI exits non-zero when SLO breach detected (latency > time cap)

## Dependencies

- Builds on: `TASK-search-service-unified.md` (search service emits telemetry)
- Builds on: `src/logger/` (existing structured logging)
- Bridges: `epic-analytics-observability.md` (existing dashboard infrastructure)
