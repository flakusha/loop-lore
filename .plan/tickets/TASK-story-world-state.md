<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Story World State Display

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Status Note:** 2026-11-09 (T4 core-t4-story): display paths verified (location/time-weather/NPCs/conditions via `src/frontend/alpine/story-state/loaders.ts` + `src/frontend/alpine/world-page-state.ts` where applicable); mobile responsive remains open.
**Priority:** P1 — High
**Effort:** Small
**Type:** Feature Task
**Tags:** story, frontend, ui, world-state
**Epic:** epic-story-mode-ui

## Summary

World state display for story mode.

## Core Features

- Location display
- Time/weather
- Active NPCs
- World conditions

## Acceptance Criteria

- [x] Current location display (`_locationId` + `fetchLocationState` in `src/frontend/alpine/story-state/api.ts`)
- [x] Time and weather (world conditions via `src/routes/worlds/world-stream.ts` + `src/frontend/alpine/world-page-state.ts`)
- [x] Active NPCs in area (`npcsAt` via `src/routes/story-states/npc.ts`, `fetchNpcState` in `src/frontend/alpine/story-state/npc-state-api.ts`)
- [x] World conditions and effects (conditions SSE snapshot + forecast)
- [ ] Mobile responsive

## Files to Create

- `src/frontend/story/world-state.ts`
- `src/frontend/story/world-conditions.ts`
