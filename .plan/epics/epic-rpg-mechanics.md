# EPIC: RPG Mechanics & Extensible Game Systems

**Status:** ⬜ Not Started
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

- [ ] Mechanics registry system
- [ ] Dice system enhancements
- [ ] Stats system (configurable models)
- [ ] Character traits system
- [ ] Combat system (turn-based)
- [ ] Skill/ability system
- [ ] XP/leveling system
- [ ] Loot system
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

### Phase 1: Core Systems

- Mechanics registry
- Stats system
- Dice system
- Combat basics

### Phase 2: Extended Systems

- Quest system
- Crafting system
- Item system
- Inventory system

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

- `src/rpg/` — RPG mechanics (does not exist yet)
- `src/rpg/registry.ts` — mechanics registry
- `src/rpg/dice.ts` — dice system
- `src/rpg/stats.ts` — stats system
- `src/rpg/traits.ts` — character traits
- `src/rpg/combat.ts` — combat system
- `src/rpg/skills.ts` — skill system
- `src/rpg/xp.ts` — XP/leveling
- `src/rpg/loot.ts` — loot system
- `src/rpg/quests.ts` — quest system
- `src/rpg/achievements.ts` — achievement system
- `src/rpg/buffs.ts` — buffs/debuffs system
- `src/rpg/inventory.ts` — inventory system
- `src/rpg/items.ts` — item system
- `src/rpg/economics.ts` — item economics and money
- `src/db/schema-rpg.ts` — RPG tables
- `src/routes/rpg.ts` — RPG API
- `plugins/core/` — built-in mechanics plugins

## References

- `docs/spec/rpg-mechanics.md` — RPG mechanics spec
- `docs/spec/rpg-implementation-roadmap.md` — implementation roadmap
- `docs/spec/plugin-system.md` — plugin system spec

## Related Epics

- **Epic Platform Research** — feature-adoption source for RPG systems.
- **Epic World & Locations** — world-level modifiers / factions overlap; delegates world state to that epic.
- **Epic Battle & Action Systems** — combat, loot, inventory, skills shared; coordinate ownership there.
- **Epic Plugin System** — mechanics registry is plugin-based (`plugins/core/`).
