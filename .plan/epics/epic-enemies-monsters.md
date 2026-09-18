<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Enemies & Monsters Systems

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** ⬜ Not Started
**Priority:** Low
**Epic ID:** EPIC-2026-37

## Summary

Catalog of every living inhabitant of a world — animals, monsters, plants,
ambient creatures — with description, behaviour profile, base stats, loot
tables, and bindings to one or more locations. Population is dynamic:
time-based repopulation (seasonal, circadian, regrowth), admin/GM-triggered
repopulation, and ecology balance (predator ↔ prey, territorial repulsion)
drive counts over the world timeline.

This epic expands the previously-stubbed `epic-enemies-monsters.md` into
the full bestiary + ecology + repopulation system.

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
| World Encounters | Encounter tables | Bestiary entries are encounter-table sources |
| Timeline System | World tick | Per-tick population + ecology update |
| Time Scale | Compressed real-time → game-time | Repopulation cadence realigned to game-time |
| Items & Economy | Loot tables + currency | Bestiary loot rolls reuse economy tables |
| RPG Mechanics | Stat model, dice, XP | Species stats feed battle resolution |
| Quests & Encounters | Quest hooks | Species entries are quest targets |
| Battle & Action | Combat resolution | Monster stats flow into encounter builders |
| Admin / GM | Force-spawn, mutation, repopulation | Admin endpoints exposed in this epic |

## Tasks

- [ ] Bestiary catalog schema
- [ ] Bestiary CRUD endpoints (admin/GM only)
- [ ] Bestiary UI (compendium + per-location population)
- [ ] Population tables per location per species
- [ ] Time-based repopulation engine
- [ ] Admin/GM force spawn and force cull endpoints
- [ ] Ecology pressure model
- [ ] Per-species quest bindings
- [ ] Bestiary → encounter table integration
- [ ] Bestiary → loot table integration
- [ ] Bestiary → XP award integration
- [ ] Bestiary state snapshots
- [ ] Migration for bestiary + population tables
- [ ] Species generation workflow (LLM, gated, review/approved) — `TASK-assistant-creative-studio-workflow-species.md`

## Design

### Bestiary Entry

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

```typescript
interface LocationPopulation {
  locationId: string;
  speciesId: string;
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

## Bind Tickets

- TASK-bestiary-catalog-schema-and-migration
- TASK-bestiary-crud-routes-admin-gm
- TASK-bestiary-ui-compendium-and-per-location-population
- TASK-bestiary-time-based-repopulation-engine
- TASK-bestiary-admin-gm-force-spawn-and-cull
- TASK-bestiary-ecology-pressure-model
- TASK-bestiary-quest-bindings-integration
- TASK-bestiary-loot-and-xp-integration
- TASK-assistant-creative-studio-workflow-species
