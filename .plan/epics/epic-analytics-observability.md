<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Analytics & Observability

**Overview:** (see sections below)


**Status:** In Progress
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** analytics, observability, telemetry, dashboard, metrics

## Overview

Conversation analytics and observability dashboard. Covers per-chat cost tracking, model comparison, and memory visualization.

## Reference

- Future features plan: `.plan/future-features-plan.md` (Tier 2)

## Features

| Feature                | ID           | Effort | Description                                     |
| ---------------------- | ------------ | ------ | ----------------------------------------------- |
| Conversation analytics | FEA-2026-056 | Low    | Per-chat cost + quality dashboard               |
| Model comparison       | FEA-2026-057 | Low    | A/B agent/model quality via `model_comparisons` |
| Memory visualizer      | FEA-2026-058 | Med    | Knowledge graph over `asset_links`              |

## Acceptance Criteria

- [x] Per-chat cost + quality dashboard functional — FEA-2026-056 (src/routes/analytics.ts:34 chat stats, :81 overview; src/routes/analytics.test.ts)
- [x] Model comparison A/B testing works — FEA-2026-057 (src/routes/model-comparisons.ts:42 POST, :133 leaderboard, :177 list; src/routes/model-comparisons.test.ts)
- [ ] Memory visualizer displays knowledge graph — FEA-2026-058 (gap-audit 2026-09-23; tracked by FEAT-MEMORY-VISUALIZER-KNOWLEDGE-GRAPH-OVER-ASSET-LINKS)

## Dependencies

- `model_comparisons` table (existing)
- `asset_links` table (existing)

## Wiring status (verified 2026-08-04)

Routes are **mounted and tested** — the "unwired" assessment is stale:

- `analyticsRoutes` mounted at `src/elysia-app.ts:200` (`app.use(analyticsRoutes({ database }))`)
- `modelComparisonsRoutes` mounted at `src/elysia-app.ts:201`
- Route test: `src/routes/analytics.test.ts`

Open work is feature-level (dashboard UI, memory visualizer), not route wiring.

## Docs-Gap Audit Remainders (2026-09-19)

- [ ] [gap-audit E10] Admin analytics: latency p50/p95/p99 trends, SSE live push, Chart.js widgets

  - Partially addressed by FEAT-062 (2026-10-30): latency trends, token-efficiency and repetition-rate
    trends plus a per-model quality comparison are live in the admin analytics panel
    (`GET /api/analytics/quality`, `src/routes/analytics/quality.ts`). **Still open:** SSE live push,
    Chart.js widgets, and p50/p95/p99 percentiles (the endpoint reports averages only).
- [ ] [gap-audit E11] Error monitoring: alert rules CRUD, webhook notifications, error grouping
  - Ticket: `FEAT-error-monitoring-alert-rules-crud-webhook-notifications-erro` (issue e21ff70)
- [ ] [gap-audit E14] Memory visualizer: knowledge graph over `asset_links` (FEA-2026-058)
  - Ticket: `FEAT-memory-visualizer-knowledge-graph-over-asset-links` (issue 2ce5c57)
- [ ] [gap-audit E13] Engagement: activity streaks, DAU/MAU, achievements dashboard
  - Ticket: `FEAT-engagement-activity-streaks-dau-mau-achievements-dashboard` (issue 93bff55)


## Usage Analytics Promotion (2026-11-24)

Open WebUI/LibreChat/LiteLLM/Langfuse patterns are promoted into existing ticket ownership. No new analytics service, event pipeline, rollup table, or usage ledger is introduced.

| Candidate | Owner | State | Dependency / boundary |
| --- | --- | --- | --- |
| C0 — telemetry UI/API contracts | `BUG-repair-telemetry-analytics-ui-contracts` | In Progress | First; repairs purge confirmation, distinct counts, daily active users, and narrow error rows. |
| C1 — canonical usage envelope | `TASK-cache-token-propagation-into-execusage-exec-log-and-aux-call` | Not Started | Owns usage normalization and missing/partial semantics; pricing owns calculated cost. |
| C2 — shared pricing registry | `TASK-per-model-per-provider-cost-attribution-for-llm-execution-st` | Not Started | Token-class prices, provenance, observed/estimated/missing cost, and coverage. |
| C3 — admin model × provider rollup | `TASK-admin-llm-execution-analytics-per-model-per-provider-rollups` | Not Started | Depends on C1/C2; bounded aggregate-only endpoint and existing admin tab. |
| C4 — Personal Usage | `FEAT-GENERATION-USAGE-ANALYTICS` | Not Started | Depends on C1/C2/C7; user-scoped 7/30/90-day usage, spend completeness, active days, models/providers. |
| C5 — activity and engagement | `FEAT-engagement-activity-streaks-dau-mau-achievements-dashboard` | Not Started | Admin DAU/MAU/streaks/achievements stay here; self-service activity merges into C4. |
| C6 — turn/session trace inspector | `TASK-prompt-turn-trace-view-why-this-output-inspector` | Not Started | Reuses generation/message/aux facts; content permission stays stricter than aggregates. |
| C7 — deletion and retention | `TASK-embedding-and-telemetry-retention-policies` | Not Started | Decide hashed-telemetry retention/deletion before broad C4 rollout. |
| C8 — charts, percentiles, SSE, generic metrics, export | Existing E10/SSE and trace-id tickets | Deferred | Add only after C0-C4 numbers are trustworthy; export needs separate permission/classification. |

### Promotion Rules

- Missing usage is not zero; unknown pricing is not free.
- Provider-reported cost wins over calculated cost.
- Aggregates sum known-cost rows only and expose completeness.
- Per-call snapshots and cumulative turn/message totals must not be double-counted.
- Personal and admin aggregate endpoints never expose raw identifiers or content.
- `FEAT-059` is reconciled as Done; its existing dashboard is not duplicated by C4.
