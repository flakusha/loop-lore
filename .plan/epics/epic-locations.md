<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Locations

**Overview:** (see sections below)


**Status:** Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** locations, world, places, travel, geography

## Summary

World-anchored location system: CRUD per world, parent/child tree with
materialized paths, same-world connection graph, and travel routes + tick
drive. Table, services, routes, and triggers all exist (see Scope); remaining
work is hardening gaps (below), not greenfield construction.

## Overview

Locations specification — covers world locations, travel mechanics, place properties, and location-based interactions. Supersedes location sections in `docs/spec/worlds.md`.

## Reference

- Spec: `docs/spec/locations.md`
- Related: `docs/spec/worlds.md`, `docs/spec/npcs.md`

## Scope

Ground state (all verified): the `locations` table (`src/db/migrations/001_init.ts:509-520`
- path/trigger block `:4082-4140`) carries `parent_location_id`, materialized
`path`, and JSON `connections`; CRUD routes live in
`src/routes/worlds/locations.ts` (+ `locations-routes.ts`, `locations-delete.ts`,
`location-connections.ts`, `location-chat.ts`); tree integrity in
`src/locations/tree.ts` (`LocationTreeService`); travel routes in
`src/locations/routes.ts` (`TravelRouteService`) + tick engine
`src/locations/travel-engine.ts`; explorer read surface in
`src/routes/location-explorer.ts` + `src/routes/worlds/fractal-locations-routes.ts`
/ `fractal-travel-routes.ts`.

- **CRUD:** list/get/create/update/delete per world (`locations.ts`,
  `locations-routes.ts`); create auto-binds a public chat
  (`location-chat.ts`, mirrored in `src/assistant/commands/create-entity.ts:138-154`);
  delete unlinks chats + clears `location_states` first (`locations-delete.ts:27-40`)
- **Tree:** `LocationTreeService` (`src/locations/tree.ts:54`) — path
  materialization, ancestors/descendants, `moveSubtree`, depth limit 12;
  DB triggers enforce no-self-parent, cross-world rejection, path rewrite
- **Connections:** `validateConnections` (`location-connections.ts:21-57`) —
  string-id arrays, same-world existence, no self-link; stored as JSON string
- **Travel:** `TravelRouteService` CRUD + stops/attach (`routes.ts:44`,
  `fractal-travel-routes.ts`), `TravelTickEngine.tick`
  (`travel-engine.ts:46`, driven by `src/cron/jobs.ts:170-172`),
  `ActorPositionService` physical/spatial split (`positions.ts:31`)

## Acceptance Criteria

- [ ] Location CRUD per world with owner-gated writes and 404-scoped reads (no cross-world leak)
- [ ] Tree integrity: materialized paths, `moveSubtree` rewrites descendants, depth limit + cross-world/self-parent rejection at trigger + service layers
- [ ] Connection validation: same-world existence, no self-link, strings-only JSON persistence
- [ ] Travel routes + tick engine advance transports; actor physical/spatial positions stay consistent
- [ ] Delete is FK-safe: chats unlinked, `location_states` cleared, no 500

## World & Location Traits

`WorldLocationTraitsService` (src/rpg/world-location-traits/, backed by
`character_world_traits` + `character_location_traits`, migration 010) tracks per-character
world and location traits.

## Wiring & Resolution Plan (2026-08-08 audit)

`WorldLocationTraitsService` is code-complete + tested but has ZERO external importers.
Resolution: mount it under `/api/rpg/world-location-traits` (world + location traits +
aggregate) via the WIRED-7 mount pattern — tracked by `TASK-wire-world-location-traits-routes`.

## Generation via Creative Studio Workflows

Location creation through the assistant is specified as a **config-driven workflow
template** in `epic-assistant-creative-studio-workflows.md` §7.6. The `location-generation`
workflow (`TASK-assistant-creative-studio-workflow-location.md`) wraps `/create location`
with step building, `entity_type_presets.location` validation (geography consistency
against the parent world), and schema/consistency/duplicate quality gates.
