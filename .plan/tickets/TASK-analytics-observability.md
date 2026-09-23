<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: EPIC: Analytics & Observability

**Summary:** Analytics dashboard, model A/B comparison, memory visualizer
**Context:** Audit 2026-09-23
**Acceptance Criteria:** Partial — 2 of 3 features shipped


**Status:** open
**Priority:** Medium
**Effort:** Large
**Epic:** epic-analytics-observability

## Summary

Conversation analytics dashboard, model A/B comparison, knowledge graph visualization.


## Shipped (verified 2026-09-23)

- [x] **FEA-2026-056** Conversation analytics — `src/routes/analytics.ts:34` (GET /api/analytics/chat/:chatId), `:81` (GET /api/analytics/overview). Tests at `src/routes/analytics.test.ts`. Wired via `src/routes/v1/content-surface.ts:51`.
- [x] **FEA-2026-057** Model comparison A/B — `src/routes/model-comparisons.ts:42` (POST), `:133` (GET leaderboard), `:177` (GET list). Tests at `src/routes/model-comparisons.test.ts`. Wired via `src/routes/v1/content-surface.ts:22,52`.


## Outstanding (gap tickets filed)

- [ ] **FEA-2026-058** Memory visualizer (knowledge graph over `asset_links`) — `FEAT-memory-visualizer-knowledge-graph-over-asset-links`
- [ ] [gap-audit E10] Admin analytics latency p50/p95/p99 + SSE live push + Chart.js widgets — `FEAT-admin-analytics-latency-p50-p95-p99-trends-sse-live-push-cha`
- [ ] [gap-audit E11] Error monitoring alert rules + webhooks + error grouping — gap ticket (see epic Docs-Gap Audit Remainders)
- [ ] [gap-audit E13] Engagement streaks + DAU/MAU + achievements — `FEAT-engagement-activity-streaks-dau-mau-achievements-dashboard`

## Linked Epics

- `epic-analytics-observability.md` (acceptance criteria updated 2026-09-23 to reflect shipped status)

## Acceptance Criteria

- [x] Analytics dashboard shipped (FEA-2026-056)
- [x] Model comparison A/B shipped (FEA-2026-057)
- [ ] Memory visualizer (FEA-2026-058) — tracked by gap ticket
- [ ] Admin analytics E10 / Error monitoring E11 / Engagement E13 — tracked by gap tickets
