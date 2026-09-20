<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: 2D Sprite World

**Tags:** (none)
**Overview:** (see sections below)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Very High total (split across sub-epics below)
**Type:** Feature Epic

## Summary

A 2D world where actors have sprites that navigate a map and use the current
backend as functionality, with characters as the interaction layer. One map
per world; locations are zones on it. Renders on custom `<canvas>` in Alpine
(zero new deps). Positions stay live over poll/SSE on the current stack.

> **⚠️ This epic is a hub.** Each sub-epic delivers independently shippable
> value; this file retains the shared vision, reuse matrix, sequencing, and
> open questions.

## Settled Decisions

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Spatial data | Separate spatial layer (maps/zones/spawns/positions); one map per world, locations as zones; connections validate adjacency |
| 2 | Renderer | Custom canvas in Alpine component, zero new deps |
| 3 | Realtime | Poll/SSE on current stack (npc-movement REST + htmx SSE) |
| 4 | MVP | Navigable + wired to backend (click-to-move, proximity → chat, char actions animate sprites) |
| 5 | Sprites | Generated pixel-art per world style; variants for emotion/equipment/health/status; avatars stay for chat close-ups / VN / answer-gameplay |
| 6 | Authority | Client prediction + reconcile: hot x/y in sim memory, server snapshots authoritative; writes event-driven (zone change, arrival, interaction), not periodic |
| 7 | Interaction | Click actor/zone docks the existing chat panel (group chat = co-travelers); canvas-native bubbles deferred |
| 8 | Simulation | Two-level proposal in this epic: TS tick now, Rust native ECS (native/loop-lore-native) seeded out as separate epic later |
| 9 | Sim↔DB | Snapshots + event feed: hot sim in memory, event-driven DB snapshots (no periodic writes — SQLite contention), SSE/poll serves snapshots + events |
| 10 | Battle entry | Rule table as tunable template, extendable; same rule runs for chat- and sprite-initiated combat; must reconcile with current chat battle entrance |
| 11 | Procgen | Strict deterministic ruleset complemented by LLM non-deterministic reconciliation (LLM proposes, ruleset disposes; seeded) |
| 12 | Levels/floors | Child locations in fractal tree (existing parent/child CTE); parallax layers read the tree |
| 13 | Boarding | Position pair switch via ActorPositionService (physical, spatial); boarding a transport moves spatial into its child subtree |
| 14 | Moderation | Rules gate first (resources, standing, karma, range), LLM narrates allowed actions |
| 15 | RAG/biz | Game epic now; business-process mapping (locations=zones, actors=agents, events=signals) as later spike |

## Reuse Matrix (existing backend)

- Chat/VN + joinable/leavable group chat — co-travelers share presence.
- Battle — entrance rules reconciled between chat and sprite world.
- Random events/encounters (`src/chat/random-events.ts`, pool) — position-aware triggers.
- Moderation/qualification pipeline — deterministic gates, then narration.
- Action log + memories — NPC-visible history ("farming pumpkins 4 weeks straight").
- Emotion avatars — sprite state variants.
- Items (common/stackable/reusable/unique), RPG mechanics, rerolls, skill checks, story context.
- Fractal system — location tree CTE, travel routes with waypoints, actor (physical, spatial) positions.

## New

- Parallax + multi-level/floor rendering per location (fractal children).
- Animation states — static sliding sprites first; walk/fight/idle later.
- NPC simulation tiers — stationary, single-location, world-traveling, full economy/trade.
- In-location boarding — transports containing boardable child locations.
- Location generation/sync — stub location first, then detailed 2D population (items, sprites, NPCs, enemies).
- Location types — sector/galaxy/world/suns/planets/structures/anomalies/storms (Starsector-style).
- Multiplayer interaction (EVE-style presence).
- Canvas perf — continuous vs discrete sim with dynamic reconciliation.

## Spatial Data Model (grounded in 013 fractal migration)

Already exists — reuse, don't reinvent:

- `locations.coord_x/y/z` (REAL, nullable) + `travel_route_stops.coord_x/y/z` — continuous position anchor per zone/stop.
- `actor_locations(actor_id, physical_location_id, spatial_location_id, entered_at)` + `ActorPositionService` — boarding semantic already defined.
- `locations.path` materialized + depth limit 12 + cycle/cross-world triggers + `LocationTreeService` — floors/levels as children.
- `travel_routes` + `TravelTickEngine.tick()` (cron, 1/min precedent) — transport movement precedent.
- `WorldEventType` enum (location_change, npc_state_change, item_transfer, combat_event, ...) — event feed vocabulary already exists.
- `npc_states(health, mental_state, knowledge, relationships, inventory, schedule)` — sim + memory substrate.

New tables (spatial layer): `world_maps(world_id, style_pack, width, height, background)`, `map_zones(map_id, location_id, x, y, w, h, z_layer, parallax_factor)`, `spawn_points(zone_id, kind, x, y)`, `actor_snapshots(actor_id, x, y, heading, updated_at, trigger)` — trigger in zone_change|arrival|interaction|combat|manual. Hot x/y live in sim memory; snapshots are event-driven (no periodic writes — SQLite contention).

## Simulation Tiers

- T0 stationary: schedule idle, position fixed; only snapshots on interaction.
- T1 single-location: wander within zone bounds; sim-memory only, snapshot on zone exit.
- T2 world-traveling: follows travel_routes via TravelTickEngine precedent; spatial updates via deriveForTransport.
- T3 economy/trade: inventories + item_transfer events; TS tick now, Rust native ECS later (separate epic; boundary: movement/economy tick functions move first when agent counts saturate TS).

## Battle Entrance Template (tunable, shared chat-sprite)

Rule table row: `{ trigger: proximity|aggression|ambush|scripted, range, standing_floor, karma_floor, resource_check, skill_check, reroll_policy }` outcome in allow|deny|escalate-to-GM. Deterministic gates first; GM/LLM narrates allowed fights only. Same table evaluated from chat-initiated and sprite-proximity paths; `combat_event` feeds the event log so both surfaces see one truth.

## Procgen Flow (seeded, LLM proposes / ruleset disposes)

1. Seeded deterministic pass: universe skeleton (region to settlement to building), location kinds, travel routes, spawn tables.
2. LLM reconciliation pass: names, lore, quirks, NPC personalities — validated against existing gates (depth <=12, cross-world, connections adjacency).
3. Stub-then-populate: location created as stub (name+kind+zone rect), later sync fills 2D detail (sprites, items, NPCs, enemies).

## Location Types to LocationKind Mapping

Starsector-style types map onto existing kinds: sector/galaxy to region, sun/planet to region|settlement, station/structure to building|transit, ship/fleet to transport (+rooms as children), anomaly/storm to pocket|region with effects, colony to settlement. Fleet = transport whose children are ship-transports (fractal). Open: extend `LocationKind` with space kinds vs reuse + flavor field.

## Canvas Perf Model

Discrete authoritative state (zone membership, snapshots) + continuous interpolated rendering (client predicts between event-driven snapshots). No per-tick DB writes; SSE/poll serves snapshots + WorldEventType feed. Static sliding sprites first; walk/fight/idle frames later. Perf ceiling evaluated at hundreds of sprites; culling by viewport + zone.

## Multiplayer Presence (EVE-style, cheap)

Presence = actor_locations + group-chat membership for co-travelers; joinable/leavable group chat is the social substrate. PvP interactions reuse moderation gates (range, standing, karma, resources). No lockstep; server snapshots resolve disputes.

## Interaction Qualification + History (settled)

- Action log = WorldEventType feed (location_change, npc_state_change, item_transfer, combat_event, ...); memory extraction reads the same feed NPC recall uses. No separate action_log table.
- Qualification = rules gate, LLM narrates: deterministic checks (resources, standing, karma, range, visibility) return allow/deny; no GM gray-zone in v1 (escalate-to-GM outcome reserved in battle table only).
- Items on map derive from existing inventories/loot tables; pickup/drop = item_transfer events. No placed-item layer in v1.
- Position-aware encounters = pass zone/participants as context into existing pure `random-events.ts` generator; caller persists via current path. No new trigger service in v1.

## Final Scope Calls (settled)

- LocationKind extended with space kinds (sector, celestial, station, anomaly, ...) via new migration; Starsector mapping becomes explicit, not flavor.
- Streaming = SSE/poll now (snapshots + WorldEventType feed); transport/factory WebSocket untouched; WS/WT only if latency proves insufficient.
- Style packs = both: curated library (fantasy/sci-fi/...) ships defaults, seeded generator derives per-world variants; versioned alongside world.
- Answer-based gameplay = canvas as VN input: clicks/answers feed existing VN/choice-card flow; no canvas-native answer mechanic in v1.

## Sub-Epics (proposed)

| Sub-Epic | Scope | Priority |
| -------- | ----- | -------- |
| **Spatial layer + view-only map** | Maps/zones/spawns/positions tables; canvas renders map + sprites at NPC/chat positions | High |
| **Movement + chat wiring** | Click-to-move, prediction+reconcile, proximity → chat, char actions animate | High |
| **Sprite pipeline** | Pixel-art generation per world style; emotion/equipment/status variants | Medium |
| **Simulation** | TS tick + snapshots/event feed; two-level proposal for Rust native ECS follow-up | Medium |
| **Battle/encounter reconcile** | Shared entrance rule table; position-aware random events | Medium |
| **Procgen + location sync** | Seeded universe setup; stub-then-populate flow; location types | Medium |
| **Boarding + levels** | Transport interiors, floor/parallax via fractal tree | Low |
| **RAG/biz spike** | Game→business-process mapping evaluation | Low |

## Sequencing

1. Spatial layer + view-only map — validates data model + art with no movement writes.
2. Movement + chat wiring — first playable slice.
3. Sprite pipeline parallel-safe with 2.
4. Simulation, battle reconcile, procgen after movement lands.
5. Boarding/levels, RAG spike last.

## Open Questions

- Sprite variant matrix: emotion tags (existing avatar chain: emotion/mood/action/location/time/outfit) + battle StatusEffect overlays compose; no combinatorial art. Ceiling question: which overlays ship first?
- Canvas chat: settled — dock existing panel first; canvas-native bubbles deferred to later slice.
- Native ECS boundary: which sim functions move to Rust first when TS tick saturates?
- World style system: who authors pixel-art style packs, and how are they versioned?
