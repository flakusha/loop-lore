<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: World Simulation Discovery And Trade Events

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-actor-autonomy-story-drive
**Tags:** world, simulation, trade

**Summary:**
World tick emits discovery and trade events between locations: caravans, traders, explorers finding new passages.

**Context:**
Trade routes and exploration should be organic - discovered by simulation, not scripted.

**Acceptance Criteria:**
- On tick, consult each party route and economy; if a trade convoy is in motion, fire `trade:route` event.
- Discovery: NPCs exploring uncharted location increase `discover_progress`; reaches threshold -> emit `location:discovered` event consumed by `epic-world-locations`.
- Events written to `world_events` log; display in admin panel.
- Tests: scheduled caravan fires trade event; exploration decays over time.

**Resolved:** 2026-10-03 registry-driven close: git issue 42327b4 (registry tip: 8b44bf16c Konstantin Fedotov Auto-closed: appended .md marker marks TASK-WORLD-SIMULATION-DISCOVERY-)

## Filing note

Re-pointed 2026-10-02 from `epic-actor-autonomy-story-drive` to
`epic-world-locations`. Greenfield: every symbol this ticket names is absent
from `src/`. `discover_progress`, `trade:route` and `location:discovered` return
no matches at all. The `world_events` "log" in the third acceptance criterion
is not a table either — it is a single JSON **column** on `story_turns`
(`StoryTurns.world_events`, `src/db/schema-story.ts:208`, table defined at
`src/db/schema-manifest.ts:2310` and `src/db/migrations/001_init.ts:1943`),
written only when a GM decision is accepted
(`src/story/game-master/accept.ts:116`; seeded to `"[]"` on insert at
`src/story/game-master/decisions.ts:130`). It is one column per GM turn, so it is
per-turn and per-chat, has no world scope and no event type or severity, and has
no writer other than those two call sites, so "display in admin panel" against it
would mean scanning a per-turn JSON blob as if it were an event store.

`epic-world-locations` is the verified owner: it is the hub that explicitly
retains the world/location data model, its Design block already models both
halves of this ticket — `discovered: boolean` plus `explorationProgress: number`
(0-100) on the location condition, and `discovered: boolean` on the world — and
its Linked Tasks already include `TASK-world-event-system.md`, which is the
`world_events` event surface this ticket is really asking for. The ticket's own
second acceptance criterion already says the `location:discovered` event is
"consumed by `epic-world-locations`", so the epic relationship runs in that
direction.

Two adjacent owners are carried in `**Related:**` rather than `**Epic:**`,
since that field holds one value: `epic-exploration-discovery` owns map-level
exploration progress and fog of war (its `GameMap` carries
`exploration_progress`, a different counter from the per-location one this
ticket names), and `epic-economy-trading` owns trade routes, prices and the
`trade_history` table that a `trade:route` event would eventually feed.
