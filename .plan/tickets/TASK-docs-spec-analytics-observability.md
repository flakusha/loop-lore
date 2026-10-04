<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Docs spec — analytics & observability

**Summary:** Author a shipped-vs-open spec for the analytics routes grounded in `src/`.
**Context:** `analyticsRoutes` + `modelComparisonsRoutes` are mounted and tested, but the route layout moved (`src/routes/analytics/` barrel) and the epic still cites stale single-file paths; FEA-056/057 shipped, 058 + gap-audit E10/11/13/14 aspirational.
**Acceptance Criteria:** (see below)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-docs-reconciliation

## Scope

Write the shipped-vs-open spec for analytics routes (target: `docs/spec/analytics-observability.md`, reconciling the existing `docs/spec/observability.md`). Verify every shipped claim against `src/routes/analytics/` (`index.ts` barrel exporting `analyticsRoutes`, `chats.ts` `chatDetailHandler`, `overview.ts` `overviewHandler`, `characters.ts` `charactersHandler`), `src/routes/model-comparisons.ts` (`modelComparisonsRoutes`) + `src/routes/model-comparisons-analytics.ts`, mounts in `src/app/register-plugins.ts` (`analyticsRoutes`, `modelComparisonsRoutes`, `modelComparisonsAnalyticsRoutes`), and tests (`src/routes/analytics.test.ts`, `src/routes/model-comparisons.test.ts`). Required split: shipped = FEA-2026-056 (per-chat cost + quality dashboard) + FEA-2026-057 (model comparison A/B); open = FEA-2026-058 memory visualizer over `asset_links` + gap-audit E10 (admin analytics latency/SSE/Chart.js), E11 (error monitoring alert rules), E13 (engagement streaks/DAU-MAU), E14 (memory visualizer graph).

## Acceptance Criteria

- [ ] Spec file written/reconciled with `## Shipped` / `## Open` sections; every shipped bullet cites a verified `src/` path above (no invented behavior)
- [ ] Shipped section covers: `GET /api/analytics/chats/:chatId`, `GET /api/analytics/overview`, `GET /api/analytics/characters` (via `analyticsRoutes` barrel), model-comparisons POST/list/leaderboard (via `modelComparisonsRoutes` + `modelComparisonsAnalyticsRoutes`), all mounted in `src/app/register-plugins.ts`
- [ ] Spec corrects stale single-file cites (`src/routes/analytics.ts`, `src/routes/model-comparisons.ts` line refs) to the current barrel layout
- [ ] Open section tracks FEA-2026-058 + gap-audit E10/E11/E13/E14 with their FEAT tickets from `epic-analytics-observability.md`
- [ ] Spec wired into `docs/.vitepress/config.mts` sidebar (no dead link)

## Linked Epics

- `epic-analytics-observability.md`
- `epic-docs-reconciliation.md`


git issue: b75700b
