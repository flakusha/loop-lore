<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Story World States CRUD

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Scope:** EPIC-STORY-MODE-UI first slice: story turn-order visualization + world-state/NPC-state CRUD wiring + turn-by-id lookup (frontend wiring of existing src/routes/story-states/ backend)
**Priority:** P2 — Medium
**Caveats:** evidence verified at commit time; re-verify if the story-state routes or panel change
**Effort:** Small
**Epic:** epic-story-mode-ui
**Related:** TASK-story-world-state, TASK-world-event-system
**Source:** FE-BE harmonization check, 2026-09-17 — 2 routes in this slice.

## Summary

Wire the per-world story-state list + create endpoints. The web UI has no caller.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/worlds/:worldId/states` | `src/routes/story-states/world-states.ts:32` |
| POST | `/api/worlds/:worldId/states` | `src/routes/story-states/world-states.ts:59` |

## Acceptance Criteria

- [x] Story/GM panel lists world states (landed: `src/components/chat/gm-world-states-panel.html`, mounted in `src/components/chat/gm-panel.html:200`)
- [x] "Add state" form posts to backend (landed: `addWorldState` → `createWorldState` POST `/api/v1/worlds/:worldId/states` — `src/frontend/alpine/story-state/mutations.ts:93`, `world-states-api.ts:47`)
- [x] List refreshes after success (landed: `addWorldState` re-runs `loadWorldStates()` after create — `mutations.ts:103`)
- [x] Owner/GM-only gate surfaced in UI (landed: `canManageWorld()` role gate + `story.ownerGmOnly` hint — `mutations.ts:63`, `gm-world-states-panel.html:24-39`)
- [x] `bun run check` green (landed: slice on dev; `plan:validate` green on the reconcile branch — no product-code change in this reconcile)

**Resolved:** 2026-11-06 registry-driven close: git issue e764684 (registry tip: 4f53f58d3 Konstantin Fedotov Close issue)
