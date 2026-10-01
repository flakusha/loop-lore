<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Graph Cluster: Boards / Spaces / World

> Substrate: FEAT-generic-2d-graph-canvas-renderer
> (`graph-canvas/{types,draw,index}.ts`: nodes `id/label/kind/color`,
> edges `from/to/label`, static layout, no force-physics v1).

## 1. Board model

Kanban is a projection over `plan_items`, not a new table
(`TASK-kanban-board-for-story-task-context-creative-drafts-planning`,
`epic-assistant-step-planning`): columns by state, swimlanes by kind
(story/task/context/steps/creative/drafts). Card move writes todo state
(same rows, both views update). htmx partials + Alpine drag, button-move
fallback; per-card links to chats/stories/RAG items. Creative exploration
boards reuse this projection with ticket links per card.

## 2. World/location graph

Hub `epic-world-locations` owns the shared model (World, Location,
TravelConnection, TimeEvent); `epic-world-travel-time` sequences first.
Sources: `locations` fractal tree (LocationTreeService), `travel_routes` +
`travel_route_stops`, `connections` (`validateConnections`).
Edge shape: `from_id`/`to_id`/`mode` (walk|ride|fly|teleport|port-gate|
free-jump)/`game_hours`/`requires_discovery`/`cost_json`. Discovery gating:
edges travelable only after both endpoints visited (404 until visit
record; admin force-unlock). Free-jump cost: gold/item/cooldown/faction
standing (`PartyEconomy.sharedCurrency`, GM bypass). Future `map_zones`
rects seed node positions; until then tree depth drives radial fallback.

## 3. Ticket overlap verdict (schema-ownership order)

1. `TASK-location-travel-connected-fast-and-free-jump` **defines** the
   `location_edges` schema + travel routes first.
2. `TASK-location-graph-editor-and-discovery-gating` **extends** it
   (requires_discovery + visit records + admin drag-to-connect UI).
3. `TASK-location-travel-graph-on-2d-canvas` is the **read-only render**
   on top (undiscovered nodes hidden per gating).
4. `TASK-party-free-jump-location-graph-edge` is a **cost extension**
   on the same edge (`epic-party-migration`).
5. `TASK-faction-relation-graph-on-2d-canvas-backend-first`: **blocked** —
   no faction tables exist (mock `npc-faction-mock.ts` only); needs a new
   migration (factions + memberships + standings) before any render work.

## 4. Implementation phases

1. **Edges table + routes** (travel-connected ticket): schema + POST
   `/api/locations/:id/edges` (admin) + POST `:id/travel` (user).
2. **Discovery + editor** (discovery-gating ticket): lock rejects, visit
   unlocks, admin force-unlock; drag-to-connect + edge attribute editor.
3. **Canvas render** (travel-graph ticket): world-scoped nodes/edges,
   200-node cap + paging, click shows location detail.
4. **Kanban board** (kanban ticket): board projection + card-move writes
   + per-card chat/story/RAG links.

## 5. Bindings

+ Epics: `epic-world-locations` (hub), `epic-world-travel-time`,
  `epic-world-management-ui` (P0 dashboard/explorer/travel UI),
  `epic-party-migration` (travel engine `advancePartyTravel`),
  `epic-use-case-agentic-workspace` (stub — spaces surface TBD).
+ Tasks: `TASK-location-travel-graph-on-2d-canvas`,
  `TASK-kanban-board-for-story-task-context-creative-drafts-planning`,
  `FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas` (substrate).
