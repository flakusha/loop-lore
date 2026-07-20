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
  enabledMechanics: string[];     // ['dice', 'stats', 'combat', 'quests']
  settings: {
    diceSystem: 'd20' | 'd100' | 'fate' | 'custom';
    combatStyle: 'turn-based' | 'real-time' | 'narrative';
    statsModel: 'dnd' | 'pathfinder' | 'custom';
    economyEnabled: boolean;
    questSystemEnabled: boolean;
  };
  customRules: Record<string, unknown>;
}
```

### Control Levels

| Level | Can Configure | Scope |
| ----- | ------------- | ----- |
| Admin | All mechanics | System-wide |
| GM | World mechanics | Per world |
| World Creator | World mechanics | Per world |
| Player | Character mechanics | Per character |

## Tasks

- [ ] Mechanics registry system
- [ ] Dice system enhancements
- [ ] Stats system (configurable models)
- [ ] Character traits system
- [ ] Combat system (turn-based)
- [ ] Skill/ability system
- [ ] XP/leveling system
- [ ] Loot system
- [ ] Quest system
- [ ] Achievement system
- [ ] Buffs/debuffs system
- [ ] Inventory system
- [ ] Item system with parameters
- [ ] Item economics and money
- [ ] Unique items
- [ ] Per-world mechanics configuration
- [ ] Plugin mechanics API
- [ ] Admin/GM mechanics UI
- [ ] Mechanics disable/enable per world

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
