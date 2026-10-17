<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: World Shaping & Divine Intervention

**Effort:** Medium
**Type:** epic
**Tags:** world, gm, rpg
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Low
**Epic ID:** EPIC-2026-33

## Summary

Player-driven world alteration and divine intervention mechanics. Players can reshape terrain, redirect rivers, and raise structures; god-like entities can intervene in world events. Extends the world from a static backdrop to a dynamic, player-malleable environment with alignment tracking (benevolent / neutral / destructive) and before/after state snapshots.

> **Source note:** The epic originally referenced `future-features-plan.md` for its description. That file was not found at HEAD, so this scope was reconstructed from the ticket (`TASK-world-shaping-divine.md`) and the epic-index entry.

## Scope

- **World-shaping actions** — raise mountains, redirect rivers, create forests, summon storms; high-cost, high-impact events gated to GMs or world-configured roles.
- **Divine intervention** — god-like entities that trigger world-altering events; leverages existing hook system (`src/generation/hooks/`).
- **Alignment tracking** — per-character / per-actor standing (benevolent / neutral / destructive) persisted to `character_relationships`; integrated with the character-scoped reputation already in `src/rpg/reputation.ts`.
- **World state snapshots** — before/after comparison via the world export/import surface (`src/routes/export-shared/worlds.ts` + `world-import/bundle.ts`).
- **API surface** — `POST /api/worlds/:id/actions` for world-shaping; `GET /api/worlds/:id/alignment` for alignment read.

## Key Integrations

| Real system at HEAD | How it connects |
| ------------------ | -------------- |
| `epic-assistant-gm-flows.md` | GM panel + `/create` generation for world assets; GM-guided story creation orchestrates world-altering events |
| World conditions (`location_states` columns: `time_of_day`, `weather`, `temperature`, `hazards`) | World-shaping actions can mutate these columns; no simulation engine writes them yet — this epic provides the mutation surface |
| NPC behavior (`src/rpg/npc-navigation/`) | NPCs respond to world changes (territory shifts, resource scarcity); `processMovementTick` reruns after world state mutations |
| `character_relationships` table | Alignment standing stored here; separate from the NSFW-scoped `src/rpg/reputation.ts` |
| World export/import (`src/routes/export-shared/worlds.ts`) | Snapshot before/after a world-shaping action; full world config + SPDX license round-trips |

## Tasks

- [ ] Design world-shaping action taxonomy (terrain, climate, population, magical)
- [ ] `POST /api/worlds/:id/actions` — execute a world-shaping action with cost/cooldown
- [ ] `GET /api/worlds/:id/alignment` — per-actor alignment read
- [ ] Alignment tracking (benevolent / neutral / destructive) written to `character_relationships`
- [ ] World state snapshot on major action (before/after via export surface)
- [ ] Divine intervention trigger hooks (`src/generation/hooks/` extension)
- [ ] Frontend world-shaping tool UI (palette of actions, cost display, preview)
- [ ] Frontend divine intervention panel (deity selection, available interventions, cooldown)
- [ ] Frontend world state comparison (before/after diff view)
- [ ] World-configurable gating (GM-only vs player-accessible per action type)

## Dependencies

- **Hub:** `epic-world-locations.md` — world/location data model
- **Extension:** `epic-worlds-extension.md` — mode-switch, world layers, export/import
- **GM flows:** `epic-assistant-gm-flows.md` — GM panel and `/create` command integration
- **UI:** `epic-world-management-ui.md` — world management dashboard that surfaces this epic's controls

## Related Epics

- [`epic-world-locations.md`](./epic-world-locations.md) — hub; owns World/Location core data model
- [`epic-worlds-extension.md`](./epic-worlds-extension.md) — shares world export/import surface for snapshots
- [`epic-world-management-ui.md`](./epic-world-management-ui.md) — world management UI that surfaces shaping tools
- [`epic-assistant-gm-flows.md`](./epic-assistant-gm-flows.md) — GM panel and `/create` generation flows

## Tickets

- `TASK-world-shaping-divine.md`
