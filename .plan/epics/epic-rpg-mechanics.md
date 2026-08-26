<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RPG Mechanics & Extensible Game Systems

**Status:** 🟡 In Progress — Phase 1 core (dice/stats/combat/xp/loot) implemented and route-wired (2026-08-14); extended systems split into 6 sub-epics
**Priority:** Medium
**Effort:** Very High (split into 6 sub-epics)
**Type:** Feature Epic
**Tags:** rpg, mechanics, dice, stats, combat, xp, loot

## Summary

RPG mechanics, multiple settings support, plugin/logic expansions, all possible improvements and mechanics implementable, ability to disable mechanics per roleplay/world, controlled by admin/GM/world creator.

> **⚠️ This epic is a HUB.** It has been split into 6 sub-epics. This file retains the shared
> integration matrix, completed Phase-1 record, and cross-system contracts only — per-subsystem
> scope, design blocks, tasks, and open questions live in the sub-epics.

## Sub-Epics

| #   | Sub-Epic                          | Epic File                            | Scope                                                                              | Sequencing |
| --- | --------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- | ---------- |
| 1   | **Core Wiring & Registry**        | `epic-rpg-core-wiring.md`            | Mount xp/loot/combat routes, combat DB schema, `src/rpg/index.ts` barrel, registry | FIRST      |
| 2   | **Mechanics Governance**          | `epic-mechanics-governance.md`       | Per-world config, control levels, plugin API, Admin/GM UI                          | SECOND     |
| 3   | **Progression**                   | `epic-rpg-progression.md`            | Character traits, skill/ability system, buffs/debuffs (`StatusEffect` owner)        | after #1   |
| 4   | **Items, Economy & Crafting**     | `epic-items-economy-crafting.md`     | Item definitions/stats, economics/money, unique items, crafting                     | after #1   |
| 5   | **Content Systems**               | `epic-rpg-content-systems.md`        | Quests (main/side/chains), achievements, RPG chat                                   | after #1   |
| 6   | **Player State Machine**          | `epic-player-state-machine.md`       | Cross-system layered state design (NOT RPG-owned)                                   | independent |

### Ownership Delegations (outside this mega-epic)

- **Inventory management UI, trading flows:** owned by **Trading & Inventory**
  (`epic-trading-inventory.md`, sub-epic of Epic Battle & Action Systems). RPG owns item
  definitions/stats only; the inventory system task moved there.
- **Spell-casting and battle-side skill rolls:** owned by **Spells & Skills**
  (`epic-spells-skills.md`, same battle sub-epic family). The skills section was removed from
  this hub accordingly; the RPG-side skill/ability *progression* system lives in
  `epic-rpg-progression.md`.

## Phase 1 Core Systems ✅ Complete (2026-07-31)

### Dice System

- Dice rolling system (already exists in plugins/core/dice-roller)
- Dice roll modifiers
- Critical success/failure
- Dice roll history and logging

### Character Stats

- Character stat system (STR, DEX, CON, INT, WIS, CHA, etc.)
- Stat modifiers and calculations
- Level progression and stat growth

### Combat System

- Turn-based combat mechanics
- Attack/defense calculations
- Damage types and resistances
- Combat flow and UI

### XP & Leveling

- Experience point system
- Level progression
- XP rewards for actions
- Level-up mechanics

### Loot System

- Loot generation and tables
- Loot rarity and quality
- Loot distribution
- Loot history and tracking

## Integration Points

> Added 2026-08-15 (matrix P6-G standardization — this hub epic was the last of the
> 17 RPG sub-system epics without a formal section).

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Config Extensions | Per-world ruleset configuration | Mechanics registry + control levels (Admin/GM/World/Player) |
| Character Core | Stats, traits, growth data | Stat model feeds dice/stats checks; traits feed skills |
| Resolution System | Unified dice/action resolution | All skill checks, attack rolls, saving throws flow through resolver |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Battle & Action Systems | Stats, dice resolution, XP rewards | Damage calc, stat modifiers, level-up after combat |
| Magic & Spell Systems | Mana, caster stats | Spell effects scale from stats; casting checks use dice |
| Crafting & Professions | Skill checks, level gates | Recipe success/failure resolution |
| Companion, Pet & Mount | Stats, progression | Pet/mount performance scales with stats |
| Exploration & Discovery | Skill checks (perception, navigation) | Location discovery resolution |
| Economy & Trading | Currency ledger, item economics | Trade/trading resolutions, shop pricing |
| NSFW Game Mechanics | Stat checks (CHA/WIS/CON) | Seduction/resistance checks |
| Social Interaction | Reputation, skill checks | Persuasion/intimidation/deception resolution |
| Weather & Environment | Environment modifiers | Weather affects stat checks and combat |
| Faction & Reputation | Reputation model | Reputation gates quest/social mechanics |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `DiceRoll` | Battle, Resolution, Social, Crime | Unified dice model (NdS±M) for all roll types |
| `CharacterStats` | Battle, Character Core, Social | STR/DEX/CON/WIS/INT/CHA shared across systems |
| `StatusEffect` | Battle, Magic, Disease, Social | Shared buff/debuff model (owned by `epic-rpg-progression.md`) |
| `SkillCheck` | Resolution, Battle, Social, Magic | Unified skill check result model |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `rpg.xp_granted` | emits → Economy, Battle | XP rewards after combat/quests |
| `rpg.loot_dropped` | emits → Inventory, Economy | Loot feeds inventory + economy |
| `resolution.roll` | subscribes ← Resolution | All rolls flow through unified resolver |
| `weather.changed` | subscribes ← Weather | Environment modifiers update mid-session |

## Implementation Phases

### Phase 1: Core Systems ✅ Complete (2026-07-31)

- [x] Dice engine — `src/rpg/dice.ts` (crypto-grade entropy, NdS±M notation, advantage/disadvantage, exploding dice)
- [x] Stats system — `src/rpg/stats.ts` (6 core abilities, D&D 5e modifiers, point-buy, 4d6-drop-lowest, standard array)
- [x] Combat system — `src/rpg/combat.ts` (initiative, attack rolls, damage, AC, saving throws, action economy, conditions)
- [x] XP system — `src/rpg/xp.ts` (D&D 5e progression, enemy CR, quests, skill challenges, ASI tracking)
- [x] Loot system — `src/rpg/loot.ts` (rarity-weighted tables, level-scaling, pre-built weapon/armor/consumable tables)
- [x] DB schema — `src/db/schema-rpg.ts` (dice_roll_history, character_stats, xp_ledger, loot_tables, loot_entries)
- [x] Routes — mounted under `/api/rpg/` (`src/routes/rpg/xp-loot.ts`, `src/routes/rpg/combat.ts`; wired 2026-08-14)
- [x] Tests — across `src/rpg/*.test.ts`

### Phase 2+: Extended Systems → Sub-Epics

All remaining work is tracked in the sub-epics table above:

- Wiring/registry/barrel/persistence → `epic-rpg-core-wiring.md`
- Per-world config/plugin API/UI → `epic-mechanics-governance.md`
- Traits/skills/buffs → `epic-rpg-progression.md`
- Items/economics/unique/crafting → `epic-items-economy-crafting.md`
- Quests/achievements/RPG chat → `epic-rpg-content-systems.md`
- Player state layers → `epic-player-state-machine.md`

## Files

- `src/rpg/dice.ts` — Dice engine (crypto-grade entropy, NdS±M notation)
- `src/rpg/stats.ts` — Stats system (6 core abilities, D&D 5e modifiers)
- `src/rpg/combat.ts` — Combat engine (initiative, attacks, damage, action economy)
- `src/rpg/xp.ts` — XP progression (D&D 5e levels 1-20)
- `src/rpg/loot.ts` — Loot system (rarity-weighted tables)
- `src/db/schema-rpg.ts` — RPG tables
- `src/routes/rpg/xp-loot.ts` — XP/loot routes (wired 2026-08-14)
- `src/routes/rpg/combat.ts` — combat resolution routes (wired 2026-08-14)
- `src/rpg/dice.test.ts`, `src/rpg/stats.test.ts`, `src/rpg/combat.test.ts`, `src/rpg/xp.test.ts`, `src/rpg/loot.test.ts` — engine tests

Per-subsystem file plans live in each sub-epic's Files section.

## References

- `docs/spec/rpg-mechanics.md` — RPG mechanics spec
- `docs/spec/rpg-implementation-roadmap.md` — implementation roadmap (phase snippets distributed to sub-epics)
- `docs/spec/plugin-system.md` — plugin system spec

## Related Epics

- **Epic Platform Research** — feature-adoption source for RPG systems.
- **Epic World & Locations** — world-level modifiers / factions overlap; delegates world state to that epic.
- **Epic Battle & Action Systems** — combat, loot, inventory, skills shared; inventory UI + spells/battle-skill-rolls owned by its Trading & Inventory / Spells & Skills sub-epics.
- **Epic Character Core System** — Character traits, personality, mood; RPG owns mechanics stats, Character Core owns identity.
- **Epic Plugin System** — mechanics registry is plugin-based (`plugins/core/`).

## Linked Tasks

- TASK-rpg-mechanics.md
- TASK-wire-xp-loot-routes.md, TASK-wire-combat-routes.md → tracked under `epic-rpg-core-wiring.md` (both done)

## Historical Roadmap Reference

The merged implementation-roadmap content that used to sit below this point has been
distributed: Phase 1–3 snippets (dice/stats/combat) are reflected in the Phase 1 record above;
the items/equipment snippet moved to `epic-items-economy-crafting.md`; the skills/xp snippet
moved to `epic-rpg-progression.md`; the Player State Machine design moved verbatim to
`epic-player-state-machine.md`.
