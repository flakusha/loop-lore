# TASK: Character RPG Stats

**Status:** ⬜ Not Started
**Priority:** P2-later — High
**Effort:** High
**Type:** Feature Task
**Tags:** rpg, stats, character, combat, foundation
**Epic:** epic-character-core-system.md

## Summary

Implement the RPG stat system: base stats (STR/DEX/CON/WIS/INT/CHA), modifiers, derived stats, and level-up mechanics. Foundation for battle/combat, skills, achievements, and all stat-dependent systems.

## Scope

### Base Stats

| Stat | Full Name | Affects |
|------|-----------|---------|
| STR | Strength | Melee damage, carry weight, physical checks |
| DEX | Dexterity | Ranged damage, initiative, dodge, stealth |
| CON | Constitution | HP, poison resistance, stamina |
| INT | Intelligence | Spell power, lore checks, crafting |
| WIS | Wisdom | Perception, healing, willpower saves |
| CHA | Charisma | Persuasion, intimidation, NPC disposition |

### Derived Stats

- HP = base + CON × level modifier
- MP = base + INT × level modifier
- Initiative = DEX + WIS modifier
- Armor Class = DEX modifier + equipment
- Carry Weight = STR × carry multiplier
- Perception = WIS modifier + level
- Social modifiers = CHA-based

### Stat Modifiers

- Ability modifier = floor((stat - 10) / 2)
- Applied to all rolls, derived calculations, and system interactions
- Range: -5 to +10 (stat range 1-30)

### Level-Up

- XP threshold table (configurable)
- Stat increase allocation (point-buy or auto)
- Derived stats recalculate on level change
- Milestone abilities at certain levels (future: `TASK-character-growth-milestones.md`)

### Validation

- Stat range: 1-30 (enforced at API + DB)
- Total stat points budget (optional, configurable per world)
- Minimum/maximum per stat (configurable)

## Backend

### Service

- `src/rpg/stats-service.ts` — stat calculation, modifier lookup, derived stats
- Export pure functions: `calcModifier(stat)`, `calcHP(stats, level)`, `calcMP(stats, level)`, `calcAC(stats, equipment)`

### API

- `GET /api/actors/:id/stats` — read stats
- `PUT /api/actors/:id/stats` — update base stats (validation + recalc derived)
- `POST /api/actors/:id/stats/level-up` — apply level-up (XP spend → stat allocation)

### DB

- `actor_stats` table (if not exists): `actor_id`, `str`, `dex`, `con`, `int`, `wis`, `cha`, `level`, `xp`, `created_at`, `updated_at`
- Migration needed if table doesn't exist in current schema

### Validation Schemas

- TypeBox schemas in `src/validation/schemas.ts` for stat ranges, level-up requests

## Integration Points

### Systems That Consume Stats

| System | How It Uses Stats |
|--------|-------------------|
| Battle & Combat (`src/rpg/combat/`) | Damage calc, hit/miss, initiative order |
| Skills & Professions | Skill check = stat modifier + skill rank |
| Achievements | Stat-based thresholds trigger achievements |
| Social Interaction | CHA-based persuasion/intimidation |
| Crafting | INT-based quality, DEX-based precision |
| Exploration | WIS perception, CON stamina |

### Events

- `character.stats_changed` — emitted on stat update, consumed by dependent systems
- `character.level_up` — emitted on level change, consumed by achievements, milestones

## Acceptance Criteria

- [ ] Base stats (STR/DEX/CON/WIS/INT/CHA) stored per actor
- [ ] Stat modifiers calculated correctly (floor((stat-10)/2))
- [ ] Derived stats (HP, MP, initiative, AC, carry weight) calculate from base + level
- [ ] Level-up endpoint applies XP and allows stat allocation
- [ ] Stat validation: range 1-30 enforced at API and DB
- [ ] Stats API returns complete stat block with modifiers and derived values
- [ ] Unit tests: modifier calc, derived stat formulas, level-up mechanics, validation bounds
- [ ] Integration: battle system reads stats for combat resolution

## Files to Create/Modify

- `src/rpg/stats-service.ts` — stat calculation service (create)
- `src/routes/actor-stats.ts` — stat API routes (create)
- `src/db/migrations/XXXX-create-actor-stats.ts` — migration (create if needed)
- `src/validation/schemas.ts` — add stat validation schemas (modify)
- `src/elysia-app.ts` — mount stat routes (modify)

## Related Tickets

- `TASK-rpg-mechanics-dice-stats.md` — dice/stat checks (complementary)
- `TASK-rpg-mechanics-combat.md` — combat system (consumes stats)
- `TASK-character-core-system.md` — character system (parent epic)
- `TASK-char-growth-schema.md` — character growth (extends stats with progression)
