<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Memory visualizer — knowledge graph over asset_links

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-analytics-observability
**Summary:** Add a knowledge-graph visualizer view + `GET /api/memory/knowledge-graph` route backed by the existing `asset_links` table.
**Context:** gap-audit 2026-09-19 of `epic-analytics-observability` (FEA-2026-058) found the memory visualizer feature has neither route nor visualization component even though `asset_links` exists and is indexed in `src/db/migrations/001_init.ts:385-449`.
**Acceptance Criteria:** Route returns `{ nodes, edges }` from `asset_links`; route mounted with existing analytics routes; frontend renders an interactive knowledge graph; deterministic backend test for seeded fixture; no heavy new dep.

## Summary

FEA-2026-058 (gap-audit 2026-09-19): no route or visualization component exists for the memory visualizer feature. The `asset_links` table provides the underlying relational data, but the user-facing knowledge graph view is missing.

The `asset_links` table is defined at `src/db/migrations/001_init.ts:385-449` and indexed at `src/db/migrations/001_init.ts:446-449`. FEA-2026-056 (per-chat cost + quality dashboard) and FEA-2026-057 (model comparison via `model_comparisons`) shipped as documented in `.plan/epics/epic-analytics-observability.md` (lines 25-29), but FEA-2026-058 is the remaining feature in the same epic that has neither route nor visualization component. The earlier duplicate ticket `FEAT-memory-knowledge-graph-visualizer` was closed as duplicate in the 2026-09-19 reconcile and explicitly cited `epic-analytics-observability.md (FEA-2026-058 memory visualizer)` as the owning artifact.

## Scope

- **Touch:** New route module under `src/routes/analytics/` (e.g. `knowledge-graph.ts`: `GET /api/memory/knowledge-graph` returning nodes + edges derived from `asset_links`); new frontend panel/component in `src/views/admin.html` analytics tab backed by `src/frontend/alpine/admin-analytics.ts` (interactive graph using existing or lightweight deps only).
- **Do NOT touch:** No DB migration needed (table exists). No changes to `asset_links` schema, no changes to existing analytics route handlers in `src/routes/analytics/`, no changes to `model_comparisons` or analytics dashboard widgets.

## Acceptance Criteria

- [ ] `GET /api/memory/knowledge-graph` returns `{ nodes: [...], edges: [...] }` shape sourced from `asset_links` (with asset metadata for node labels and entity_type/entity_id for edges). Graph semantics: one node per asset (label = asset metadata) plus one node per linked entity (`entity_type:entity_id`); one edge per `asset_links` row (asset ↔ entity, labeled by `label` relationship)
- [ ] Route mounted and registered in `src/app/register-plugins.ts` (and `src/routes/v1/content-surface.ts` if v1 exposure is wanted) alongside the existing `analyticsRoutes`
- [ ] Backend unit test: route handler returns deterministic node+edge shape for a seeded `asset_links` fixture
- [ ] Frontend view renders an interactive knowledge graph (zoom/pan, node hover for asset metadata, edge hover for relationship)
- [ ] Frontend view is reachable from the existing analytics dashboard navigation (or admin nav, whichever the spec dictates)
- [ ] No new heavyweight dependency added without justification (YAGNI)
