# EPIC: Display Transitions — world ↔ chat ↔ map ↔ inventory ↔ battle

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

**Status:** Not Started
**Priority:** High
**Effort:** Large (5 tasks, each independently shippable)
**Type:** Feature Epic
**Tags:** transitions, canvas, world-display, battle-entrance, arrival-events, writeback
**Overview:** Close the world↔chat↔map↔inventory↔battle display-transition loop across the canvas surfaces in 5 cheapest-first tasks, reusing existing endpoints.

## Summary

Every display hop (world↔chat↔map↔inventory↔battle) already has a backend
path, but no canvas carries it: game-canvas is read-only, VN choice-select is
the only clickable world-transition, battle acts in active chat only.
Research: `.tmp/research/2d-canvas-3d-world/transitions.md` (2026-11-03,
scout briefs `agent://InnerPlanarian` + `agent://ConfidentialAlligator`).

This epic closes the transition loop in 5 tasks, cheapest-first. Each task
reuses existing endpoints — no new backend shapes except where noted.

## Sequencing

| # | Task | Unblocks |
|---|------|----------|
| 1 | Arrival events on the existing tick | travel liveness for every surface |
| 2 | Mount-or-delete party engine decision | ends unmounted-engine ambiguity |
| 3 | NPC/position destination validation | click-to-move trust |
| 4 | Battle→world writeback on endBattle | closes the battle loop |
| 5 | Canvas clicks → existing travel/select endpoints | turns read-only canvas into transition surface |

Zone rendering on game-canvas stays in `epic-2d-sprite-world`
(`FEAT-2d-world-view-only-canvas-map`); snapshot/SSE feed stays in
`TASK-2d-world-review-world-scoped-snapshot-and-event-sse-feed`;
proximity→chat stays in `FEAT-2d-world-click-to-move` +
`TASK-2d-world-review-proximity-query`; entrance rule table stays in
`FEAT-2d-world-shared-battle-entrance-rule-table` + reconcile ticket.
This epic is the glue between them, not a replacement.

## Open questions

- Does `world/stream` (conditions) or a new `events/stream` carry arrivals?
  (Task 1 decides; leans to extending the existing feed.)
- Party engine: mount to cron/route or delete? (Task 2 decides; deletion is
  acceptable — the NPC movement tick already covers live movement.)
