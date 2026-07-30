# EPIC: RPG Mechanics & Extensible Game Systems

**Status:** 🟡 Phase 1 Complete — Core systems (dice, stats, combat, XP, loot) implemented in `src/rpg/`
**Priority:** Medium
**Effort:** Very High
**Type:** Feature Epic

## Summary

RPG mechanics, multiple settings support, plugin/logic expansions, all possible improvements and mechanics implementable, ability to disable mechanics per roleplay/world, controlled by admin/GM/world creator.

## Core Systems

### Dice System

- Dice rolling system (already exists in plugins/core/dice-roller)
- Dice roll modifiers
- Critical success/failure
- Dice roll history and logging

### Character Stats & Traits

- Character stat system (STR, DEX, CON, INT, WIS, CHA, etc.)
- Character traits and personality
- Stat modifiers and calculations
- Level progression and stat growth

### Combat System

- Turn-based combat mechanics
- Attack/defense calculations
- Damage types and resistances
- Combat flow and UI

### Skills System

- Skill trees and progression
- Skill points allocation
- Skill cooldowns and requirements
- Skill effects and modifiers

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

## Extended Systems

### Quest System

- Quest creation and management
- Quest objectives and tracking
- Quest rewards and completion
- Quest chains and dependencies

### Achievement System

- Achievement definitions and tracking
- Achievement unlocking and display
- Achievement rewards
- Achievement categories and tiers

### Buffs & Debuffs System

- Temporary status effects
- Effect stacking and duration
- Effect application and removal
- Visual indicators and UI

### Inventory System

- Inventory slots and capacity
- Item organization and sorting
- Inventory management UI
- Inventory persistence

### Item System

- Item definitions and parameters
- Item types (weapon, armor, consumable, etc.)
- Item rarity (common, uncommon, rare, epic, legendary)
- Unique items with special properties
- Item economics (buy/sell/trade)
- Money/currency system
- Item crafting and enhancement

## Design

### Mechanics Registry

```
Mechanics (plugin-based):
├── Dice (built-in) — already exists
├── Stats — character attributes
├── Combat — turn-based combat
├── Inventory — items, equipment
├── Skills — abilities, spells
├── XP — experience, leveling
├── Quests — quest system
├── Achievements — achievement system
├── Buffs — status effects
├── Items — item system with economics
├── Custom — user-defined mechanics
```

### Per-World Configuration

```typescript
interface WorldMechanicsConfig {
  enabledMechanics: string[]; // ['dice', 'stats', 'combat', 'quests']
  settings: {
    diceSystem: "d20" | "d100" | "fate" | "custom";
    combatStyle: "turn-based" | "real-time" | "narrative";
    statsModel: "dnd" | "pathfinder" | "custom";
    economyEnabled: boolean;
    questSystemEnabled: boolean;
  };
  customRules: Record<string, unknown>;
}
```

### Control Levels

| Level         | Can Configure       | Scope         |
| ------------- | ------------------- | ------------- |
| Admin         | All mechanics       | System-wide   |
| GM            | World mechanics     | Per world     |
| World Creator | World mechanics     | Per world     |
| Player        | Character mechanics | Per character |

## Tasks

- [x] Mechanics registry system (via routes/rpg.ts)
- [x] Dice system enhancements — crypto-grade entropy, NdS±M notation
- [x] Stats system (D&D 5e model — 6 core abilities)
- [ ] Character traits system
- [x] Combat system (turn-based) — initiative, attacks, damage, action economy
- [ ] Skill/ability system
- [x] XP/leveling system — D&D 5e progression
- [x] Loot system — rarity-weighted tables
- [ ] Quest system (main, side, chains, story end conditions)
- [ ] Achievement system
- [ ] Buffs/debuffs system
- [ ] Inventory system
- [ ] Item system with parameters and gameplay impact
- [ ] Item economics and money
- [ ] Unique items
- [ ] Crafting system (recipes, limitations, pre-compiled items)
- [ ] RPG chat with question-based gameplay
- [ ] Per-world mechanics configuration
- [ ] Plugin mechanics API
- [ ] Admin/GM mechanics UI
- [ ] Mechanics disable/enable per world

## Open Questions

### Quest System

- How should quest chains handle branching paths?
- Should failed quests be retryable or permanent?
- How to handle party death — full reset or checkpoint system?
- Should quests have dynamic difficulty based on party level?

### Crafting System

- Should crafting success be purely random or skill-based?
- How to handle recipe discovery — find, buy, or unlock?
- Should crafted items be tradeable?
- How to balance crafting vs. loot drops?

### Item System

- How to handle item scaling with character level?
- Should items have durability degradation over time?
- How to balance unique vs. common items?
- Should items have set bonuses or individual bonuses?

### RPG Chat Questions

- How many options per question is optimal (2-4)?
- Should questions have time limits?
- How to handle "none of the above" options?
- Should questions be voice-acted or text-only?
- How to handle state transitions between question and free-form modes?
- Should question mode be triggered automatically or manually?
- How to maintain immersion during mode switches?

### State Management

- How to handle concurrent modes (e.g., trading during battle)?
- Should modes be mutually exclusive or layered?
- How to persist mode state across sessions?
- Should mode transitions be reversible?
- How to handle mode conflicts (e.g., battle interrupting trade)?

### Integration

- How should RPG mechanics interact with LLM generation?
- Should mechanics be enforced or suggested?
- How to handle player vs. character knowledge?
- Should mechanics be visible to all players or hidden?

## Implementation Phases

### Phase 1: Core Systems ✅ Complete (2026-07-31)

- [x] Dice engine — `src/rpg/dice.ts` (crypto-grade entropy, NdS±M notation, advantage/disadvantage, exploding dice)
- [x] Stats system — `src/rpg/stats.ts` (6 core abilities, D&D 5e modifiers, point-buy, 4d6-drop-lowest, standard array)
- [x] Combat system — `src/rpg/combat.ts` (initiative, attack rolls, damage, AC, saving throws, action economy, conditions)
- [x] XP system — `src/rpg/xp.ts` (D&D 5e progression, enemy CR, quests, skill challenges, ASI tracking)
- [x] Loot system — `src/rpg/loot.ts` (rarity-weighted tables, level-scaling, pre-built weapon/armor/consumable tables)
- [x] DB schema — `src/db/schema-rpg.ts` (dice_roll_history, character_stats, xp_ledger, loot_tables, loot_entries)
- [x] Routes — `src/routes/rpg.ts` (6 endpoints under /api/rpg/)
- [x] Tests — 189 tests across 5 test files

### Phase 2: Extended Systems

- [ ] Quest system (main, side, chains, story end conditions)
- [ ] Achievement system
- [ ] Buffs/debuffs system
- [ ] Inventory system
- [ ] Item system with parameters and gameplay impact
- [ ] Item economics and money
- [ ] Unique items
- [ ] Crafting system (recipes, limitations, pre-compiled items)
- [ ] RPG chat with question-based gameplay
- [ ] Per-world mechanics configuration
- [ ] Plugin mechanics API
- [ ] Admin/GM mechanics UI
- [ ] Mechanics disable/enable per world

### Phase 3: Advanced Features

- RPG chat questions
- Achievement system
- Buffs/debuffs system
- Skill trees

### Phase 4: Polish & Integration

- UI/UX refinement
- Performance optimization
- Plugin API
- Documentation

## Files

- `src/rpg/dice.ts` — Dice engine (crypto-grade entropy, NdS±M notation)
- `src/rpg/stats.ts` — Stats system (6 core abilities, D&D 5e modifiers)
- `src/rpg/combat.ts` — Combat engine (initiative, attacks, damage, action economy)
- `src/rpg/xp.ts` — XP progression (D&D 5e levels 1-20)
- `src/rpg/loot.ts` — Loot system (rarity-weighted tables)
- `src/db/schema-rpg.ts` — RPG tables (5 tables)
- `src/routes/rpg.ts` — RPG API (6 endpoints)
- `src/rpg/dice.test.ts` — Dice engine tests
- `src/rpg/stats.test.ts` — Stats tests
- `src/rpg/combat.test.ts` — Combat tests
- `src/rpg/xp.test.ts` — XP tests
- `src/rpg/loot.test.ts` — Loot tests

### Not yet implemented

- `src/rpg/registry.ts` — mechanics registry
- `src/rpg/traits.ts` — character traits
- `src/rpg/skills.ts` — skill system
- `src/rpg/quests.ts` — quest system
- `src/rpg/achievements.ts` — achievement system
- `src/rpg/buffs.ts` — buffs/debuffs system
- `src/rpg/inventory.ts` — inventory system
- `src/rpg/items.ts` — item system
- `src/rpg/economics.ts` — item economics and money
- `plugins/core/` — built-in mechanics plugins

## References

- `docs/spec/rpg-mechanics.md` — RPG mechanics spec
- `docs/spec/rpg-implementation-roadmap.md` — implementation roadmap
- `docs/spec/plugin-system.md` — plugin system spec

## Related Epics

- **Epic Platform Research** — feature-adoption source for RPG systems.
- **Epic World & Locations** — world-level modifiers / factions overlap; delegates world state to that epic.
- **Epic Battle & Action Systems** — combat, loot, inventory, skills shared; coordinate ownership there.
- **Epic Character Core System** — Character traits, personality, mood; RPG owns mechanics stats, Character Core owns identity.
- **Epic Plugin System** — mechanics registry is plugin-based (`plugins/core/`).

## Linked Tasks

- TASK-rpg-mechanics.md
