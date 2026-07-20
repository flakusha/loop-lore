# EPIC: RPG Mechanics & Extensible Game Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Type:** Feature Epic

## Summary

RPG mechanics, multiple settings support, plugin/logic expansions, all possible improvements and mechanics implementable, ability to disable mechanics per roleplay/world, controlled by admin/GM/world creator.

## Scope

- Dice rolling system (already exists in plugins/core/dice-roller)
- Character stats system
- Combat mechanics
- Inventory system
- Skill/ability system
- Experience/leveling
- Multiple game settings (D&D, Pathfinder, custom)
- Plugin-based mechanics expansion
- Per-world mechanics configuration
- Admin/GM/world creator controls

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
├── Custom — user-defined mechanics
```

### Per-World Configuration

```typescript
interface WorldMechanicsConfig {
  enabledMechanics: string[];     // ['dice', 'stats', 'combat']
  settings: {
    diceSystem: 'd20' | 'd100' | 'fate' | 'custom';
    combatStyle: 'turn-based' | 'real-time' | 'narrative';
    statsModel: 'dnd' | 'pathfinder' | 'custom';
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
- [ ] Stats system (configurable models)
- [ ] Combat system (turn-based)
- [ ] Inventory system
- [ ] Skill/ability system
- [ ] XP/leveling system
- [ ] Per-world mechanics configuration
- [ ] Plugin mechanics API
- [ ] Admin/GM mechanics UI
- [ ] Mechanics disable/enable per world

## Files

- `src/rpg/` — RPG mechanics (does not exist yet)
- `src/rpg/registry.ts` — mechanics registry
- `src/rpg/stats.ts` — stats system
- `src/rpg/combat.ts` — combat system
- `src/rpg/inventory.ts` — inventory system
- `src/rpg/skills.ts` — skill system
- `src/rpg/xp.ts` — XP/leveling
- `src/db/schema-rpg.ts` — RPG tables
- `src/routes/rpg.ts` — RPG API
- `plugins/core/` — built-in mechanics plugins

## References

- `docs/spec/rpg-mechanics.md` — RPG mechanics spec
- `docs/spec/rpg-implementation-roadmap.md` — implementation roadmap
- `docs/spec/plugin-system.md` — plugin system spec
