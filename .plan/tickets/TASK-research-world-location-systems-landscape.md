<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Research — Famous World/Location Systems Landscape

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Medium
**Type:** Research Task
**Tags:** research, worlds, locations, geography, world-building
**Epic:** epic-world-locations (research sub-area)
**Related:** .tmp/world-location-template-gap-analysis.md, TASK-world-template-full-model-coverage

## Summary

The existing `docs/meta/research/*` corpus is mechanics-dominated (combat/dice/stats/items/
XP) and contains **no** world-building, geography, or location-graph research. This task
produces a research doc surveying how leading games model worlds and locations, and maps each
to loop-lore's current `World`/`Location` spec + gaps — directly informing
`TASK-world-template-full-model-coverage` and the worlds-extension epic.

## Background

Gap analysis (`.tmp/world-location-template-gap-analysis.md`) confirmed via directory listing
that `docs/meta/research/` has zero world/location docs. loop-lore's spec already models most
dimensions found in BG3/Fallout/RimWorld, but the research backing and the config bridge are
both missing.

## Work

1. **Survey famous world/location systems:**
   - **BG3** — region map (Act I–III), fast-travel, discovered/unexplored, sub-areas, world-state changes
   - **Fallout 3/4/NV** — worldspaces/cells, settlements, faction regions, radiant location quests
   - **Disco Elysium** — districts, interior/exterior, world state (strike, body)
   - **AI Dungeon** — scenario/setting as world prompt, custom worlds, location = narrative state
   - **D&D / Forgotten Realms** — planar/location graphs, travel, random encounters
   - **RimWorld** — biome tile-map, POIs, faction bases, world-gen
   - **Skyrim** — holds/cities, dungeons, radiant locations, discovery
   - **Minecraft** — biomes, structures, dimensions, chunk world-gen
2. **Extract world/location modeling patterns:** region graphs, travel connections, discovery/
   visibility, conditions/anomalies, time/state mutation, resources/items/npcs at location,
   biome/style, economy/rules, world-state narratives.
3. **Map each pattern to loop-lore:** current equivalent (spec field / service / ticket) + gap.
4. **Author `docs/meta/research/world-location-systems-landscape.md`** with survey + mapping
   table + recommendations for loop-lore's world/location model and config-template layer.

## Acceptance Criteria

- Doc covers ≥7 surveyed systems with concrete world/location feature lists.
- Each system mapped to loop-lore current state + explicit gap.
- Recommendations reference existing tickets (worlds-extension, world-location-encryption,
  traits-routes, editor UI) and the new `TASK-world-template-full-model-coverage`.
- Doc placed under `docs/meta/research/` and linked from `epic-world-locations.md`.

## Related Files

- `docs/meta/research/rpg-systems-comparison.md` (format companion)
- `docs/spec/worlds.md`, `docs/spec/locations.md`
- `.tmp/world-location-template-gap-analysis.md`

## Notes

- Research only — no code. Output is the doc.
- Contrast with companion-only platforms (SillyTavern/Kindroid/Nomi) that lack world systems.
