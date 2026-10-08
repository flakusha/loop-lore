<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Enemies & Monsters Systems

**Tags:** bestiary, ecology, world, rpg, monsters, flora, fauna, repopulation
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** the RPG/battle/loot substrate this epic builds on is implemented (combat primitives, battle orchestration, NPC state, NPC AI, loot); this epic's own deliverable — the bestiary catalog, ecology model, and repopulation engine — has no code behind it yet, and every bound ticket is still Not Started. The encounter→battle gap recorded in `docs/spec/enemies-monsters.md` blocks the bestiary→encounter-integration work: species combat stats can only reach a battle once an encounter can actually start one.
**Priority:** Low
**Epic ID:** EPIC-2026-37
**Effort:** Medium
**Type:** epic

## Summary

Catalog of every living inhabitant of a world — animals, monsters, plants,
ambient creatures — with description, behaviour profile, base stats, loot
tables, and bindings to one or more locations. Population is dynamic:
time-based repopulation (seasonal, circadian, regrowth), admin/GM-triggered
repopulation, and ecology balance (predator ↔ prey, territorial repulsion)
drive counts over the world timeline.

This epic expands the previously-stubbed `epic-enemies-monsters.md` into
the full bestiary + ecology + repopulation system.

## Implementation Status

**Nothing in this epic is built.** There is no `src/bestiary/`, no
`bestiary_entries` table, and no `location_population` table in
`src/db/schema*.ts` or `src/db/migrations/001_init.ts`. All eight bound
`TASK-bestiary-*` tickets are `Not Started`.

The prerequisite substrate does exist and is what this epic plugs into:

| Substrate | Path |
| --------- | ---- |
| Combat primitives (actions, attacks, conditions, damage, initiative, saves) | `src/rpg/combat/` |
| Battle orchestration + persistence | `src/rpg/service/battles/` |
| NPC state (`npc_states`) | `src/db/schema-story.ts`, `src/story/world-state/` |
| NPC AI (movement/pathfinding; battle decisions) | `src/rpg/npc-navigation/service/`, `src/battle/npc-integration/` |
| Loot (generation, tables, templates, weights) | `src/rpg/loot/` |

Encounters also exist (`src/rpg/encounters/` — `index.ts` plus `service/` with
crud, defaults, participant-legs, phases, reputation-leg, row, types, venue),
but **`EncounterService` is not wired to the battle engine**: no route or state
machine connects them. That gap is a blocking dependency for the
bestiary→encounter-integration task below, because a species' combat stats only
matter if an encounter can actually start a battle.

## Scope

- Flora (plants, fungus, ambient herbs/trees/crops) — passive inhabitants
- Fauna (animals, insects, fish, birds) — ambient or aggressive
- Monsters (hostile beasts, undead, elementals, dragons) — combat-grade
- Per-entry behaviour: aggressiveness, intellect, friendliness, diet, schedule
- Per-entry loot table and XP reward
- Per-entry quest bindings (which quests target this species)
- Per-entry state (health, alive/dead, generation count, time-of-death)
- Population model: per-location per-species counts with repopulation rules
- Admin/GM actions: force spawn, force cull, relocate, mutate
- Time-based repopulation: circadian (day/night), seasonal, harvest regrowth
- Ecology balance: predator→prey pressure, territorial repulsion

## Key Integrations

| System | What It Provides | How This Epic Uses It |
| ------ | ---------------- | --------------------- |
| World & Locations | Location grid + travel rules | Per-location population tables |
| World NPCs | NPC placement engine | Predators/herders register as world NPCs |
| World Encounters | Encounter tables | Bestiary entries are encounter-table sources — **blocked** until encounter→battle is wired |
| Timeline System | World tick | Per-tick population + ecology update |
| Time Scale | Compressed real-time → game-time | Repopulation cadence realigned to game-time |
| Items & Economy | Loot tables + currency | Bestiary loot rolls reuse economy tables |
| RPG Mechanics | Stat model, dice, XP | Species stats feed battle resolution |
| Quests & Encounters | Quest hooks | Species entries are quest targets |
| Battle & Action | Combat resolution | Monster stats flow into encounter builders |
| Admin / GM | Force-spawn, mutation, repopulation | Admin endpoints exposed in this epic |

## Tasks

- [ ] Bestiary catalog schema — species table + per-location population table and the
      migration that creates both — [TASK-bestiary-catalog-schema-and-migration.md](../tickets/TASK-bestiary-catalog-schema-and-migration.md)
- [ ] Bestiary CRUD endpoints (admin/GM only) — [TASK-bestiary-crud-routes-admin-gm.md](../tickets/TASK-bestiary-crud-routes-admin-gm.md)
- [ ] Bestiary UI (compendium + per-location population) — [TASK-bestiary-ui-compendium-and-per-location-population.md](../tickets/TASK-bestiary-ui-compendium-and-per-location-population.md)
- [ ] Time-based repopulation engine — [TASK-bestiary-time-based-repopulation-engine.md](../tickets/TASK-bestiary-time-based-repopulation-engine.md)
- [ ] Admin/GM force spawn and force cull endpoints — [TASK-bestiary-admin-gm-force-spawn-and-cull.md](../tickets/TASK-bestiary-admin-gm-force-spawn-and-cull.md)
- [ ] Ecology pressure model — [TASK-bestiary-ecology-pressure-model.md](../tickets/TASK-bestiary-ecology-pressure-model.md)
- [ ] Per-species quest bindings — [TASK-bestiary-quest-bindings-integration.md](../tickets/TASK-bestiary-quest-bindings-integration.md)
- [ ] Bestiary → loot table and XP award integration (both share one ticket) — [TASK-bestiary-loot-and-xp-integration.md](../tickets/TASK-bestiary-loot-and-xp-integration.md)
- [ ] Species generation workflow (LLM, gated, review/approved) — [TASK-assistant-creative-studio-workflow-species.md](../tickets/TASK-assistant-creative-studio-workflow-species.md)
- [ ] Bestiary → encounter table integration — **no ticket yet; blocked** on the
      encounter→battle wiring gap. Owned by `epic-world-encounters.md`.

The migration for the catalog and population tables, the per-location/per-species
population rows, and bestiary state snapshots (health, alive/dead, generation
count, time-of-death) are folded into the schema, repopulation, and ecology
tickets above rather than tracked as separate rows.

## Design

### Bestiary Entry

Persisted as `bestiary_entries`, with `behaviour`, `stats`, `quest_ids`, `habitat`,
and `generation` stored as JSON columns (`behaviour_json`, `stats_json`,
`quest_ids_json`, `habitat_json`, `generation_json`) and FK
`world_id -> worlds.id`. `category` is validated as `flora|fauna|monster`.

```typescript
interface BestiaryEntry {
  id: string;
  worldId: string;
  category: "flora" | "fauna" | "monster";
  name: string;
  description: string;
  behaviour: {
    aggressiveness: number;
    intellect: number;
    friendliness: number;
    diet: "herbivore" | "carnivore" | "omnivore" | "photosynth" | "fungivore" | "none";
    schedule: "diurnal" | "nocturnal" | "crepuscular" | "constant";
    territorial: boolean;
    pack: boolean;
  };
  stats: CharacterStats;
  lootTableId: string;
  xpReward: number;
  questIds: string[];
  habitat: {
    preferredLocationTags: string[];
    predatorOfIds: string[];
    preyOfIds: string[];
  };
  generation: {
    defaultPopulation: number;
    repopulation: RepopulationRule;
  };
}

interface RepopulationRule {
  mode: "circadian" | "seasonal" | "harvest-regrowth" | "manual" | "ecology";
  interval: number;
  cap: number;
  probabilityPerTick: number;
}
```

### Population State Per Location

Persisted as `location_population` with `PRIMARY KEY(location_id, species_id)`
and FK `species_id -> bestiary_entries.id`, so a species appears at most once per
location and removing a species takes its population rows with it.

```typescript
interface LocationPopulation {
  locationId: string;
  speciesId: string; // FK -> BestiaryEntry.id; half of the composite primary key
  count: number;
  lastDeathTick: number;
  lastSpawnTick: number;
  generation: number;
  ecologyPressure: number;
}
```

## Generation & Review Integration

Bestiary entries are not only admin-authored rows — species are a first-class
**entity-generation kind**:

- **Workflow generation** — `species` intent target + step schema + quality gates
  (schema / consistency / duplicate / balance) + confirmation, dispatching to the
  bestiary insert: `TASK-assistant-creative-studio-workflow-species.md` (extends
  `epic-entity-generation-workflows.md` §7.6).
- **In-place, story-introduced species** — flora/fauna/monsters introduced by the
  story generate in place via the unified mechanism
  (`FEAT-in-story-character-generation-via-assistant-chat-handoff.md`) with a
  species per-kind template; ambient introduction (no generation) remains a valid
  no-op path.
- **Owner backfill** — an approved species can be backfilled as referenced-by owner
  of the messages that introduced it
  (`TASK-in-place-generation-owner-backfill.md`).
- **Review/approve before game-asset** — generated species pass the same
  review/approval surface as characters, items, and locations before becoming
  world state; admin CRUD (`TASK-bestiary-crud-routes-admin-gm.md`) remains the
  manual path.
- **Monster stat reuse** — monster stats are `CharacterStats`; generation reuses
  the character stat/edit capabilities rather than a bespoke species editor.

## Open Questions

- Bestiary entries: world-scoped or template-scoped?
- Flora harvest binding to economy vs fauna kills?
- Predator-prey simulation: continual or world-tick only?
- Ecology imbalance triggering NPC faction events?

## Related Epics

- [`epic-world-encounters.md`](epic-world-encounters.md) — owns encounter tables and the
  blocked bestiary→encounter integration.
- [`epic-battle-action-systems.md`](epic-battle-action-systems.md) — combat resolution
  that consumes species stats, and the encounter→battle wiring gap.
- [`epic-rpg-core-wiring.md`](epic-rpg-core-wiring.md) — the RPG substrate (stats, dice,
  XP) that species entries plug into.
- [`epic-entity-generation-workflows.md`](epic-entity-generation-workflows.md) — parent of
  the species generation workflow.
- [`epic-assistant-creative-studio-workflows.md`](epic-assistant-creative-studio-workflows.md)
  — owns the assistant-side workflow generation and review surface for species.
- [`epic-items-economy-crafting.md`](epic-items-economy-crafting.md) — loot tables and
  currency that bestiary loot rolls reuse.

## Bind Tickets

- [TASK-bestiary-catalog-schema-and-migration.md](../tickets/TASK-bestiary-catalog-schema-and-migration.md)
- [TASK-bestiary-crud-routes-admin-gm.md](../tickets/TASK-bestiary-crud-routes-admin-gm.md)
- [TASK-bestiary-ui-compendium-and-per-location-population.md](../tickets/TASK-bestiary-ui-compendium-and-per-location-population.md)
- [TASK-bestiary-time-based-repopulation-engine.md](../tickets/TASK-bestiary-time-based-repopulation-engine.md)
- [TASK-bestiary-admin-gm-force-spawn-and-cull.md](../tickets/TASK-bestiary-admin-gm-force-spawn-and-cull.md)
- [TASK-bestiary-ecology-pressure-model.md](../tickets/TASK-bestiary-ecology-pressure-model.md)
- [TASK-bestiary-quest-bindings-integration.md](../tickets/TASK-bestiary-quest-bindings-integration.md)
- [TASK-bestiary-loot-and-xp-integration.md](../tickets/TASK-bestiary-loot-and-xp-integration.md)
- [TASK-assistant-creative-studio-workflow-species.md](../tickets/TASK-assistant-creative-studio-workflow-species.md)
