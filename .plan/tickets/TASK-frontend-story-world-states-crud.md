<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Story World States CRUD

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** P2 — Medium
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

- [ ] Story/GM panel lists world states
- [ ] "Add state" form posts to backend
- [ ] List refreshes after success
- [ ] Owner/GM-only gate surfaced in UI
- [ ] `bun run check` green
