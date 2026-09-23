<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Analytics & Observability

**Overview:** (see sections below)


**Status:** 📝 Draft
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
- [ ] [gap-audit E11] Error monitoring: alert rules CRUD, webhook notifications, error grouping
  - Ticket: `FEAT-error-monitoring-alert-rules-crud-webhook-notifications-erro` (issue e21ff70)
- [ ] [gap-audit E14] Memory visualizer: knowledge graph over `asset_links` (FEA-2026-058)
  - Ticket: `FEAT-memory-visualizer-knowledge-graph-over-asset-links` (issue 2ce5c57)
- [ ] [gap-audit E13] Engagement: activity streaks, DAU/MAU, achievements dashboard
  - Ticket: `FEAT-engagement-activity-streaks-dau-mau-achievements-dashboard` (issue 93bff55)
