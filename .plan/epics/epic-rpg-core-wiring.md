<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RPG Core Wiring & Registry

**Status:** 🟡 In Progress — XP/loot + combat routes mounted (2026-08-14); registry module, barrel, combat persistence outstanding
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** rpg, wiring, routes, registry, combat, persistence
**Parent Epic:** RPG Mechanics & Extensible Game Systems (epic-rpg-mechanics.md)
**Sequencing:** FIRST — unblocks every consumer in the RPG dependency matrix

## Summary

Mount the Phase-1 RPG engines (dice/stats/combat/xp/loot) into production HTTP surfaces, add the missing combat DB persistence layer, expose a `src/rpg/index.ts` barrel, and build the plugin-based mechanics registry (`src/rpg/registry.ts`). This sub-epic is the dependency gate for all other RPG Mechanics sub-epics and every external consumer in the integration matrix (Battle, Magic, Economy, NSFW, Social, Weather, Faction).

## Sub-Epic of

Part of the **RPG Mechanics & Extensible Game Systems** mega-epic. See parent epic for full scope, integration matrix, and slicing rationale.

## Scope

- XP + loot route mounting with shared persistence (`/api/rpg/xp`, `/api/rpg/loot`)
- Combat engine exposed as stateless resolution endpoints (`/api/rpg/combat`)
- Combat DB persistence schema (engine currently in-memory/stateless)
- `src/rpg/index.ts` barrel re-exporting public APIs
- Plugin-based mechanics registry `src/rpg/registry.ts`

## Wiring & Resolution Plan (2026-08-08 audit, updated 2026-08-26)

Phase 1 core (dice/stats/combat/xp/loot) was code-complete + tested + schema-backed
(dice_roll_history, character_stats, xp_ledger, loot_tables, loot_entries) but UNWIRED — the
xp/loot/combat engines had ZERO production consumers and no `src/rpg/index.ts` barrel exists.
Combat is a pure in-memory engine with no DB schema. Resolution: mount xp (award/level) + loot
(generate/table) with shared persistence and combat as stateless resolution endpoints via
tickets `TASK-wire-xp-loot-routes` and `TASK-wire-combat-routes` (WIRED-7 mount pattern under
`src/routes/rpg/`). Quests/achievements/skills/crafting deferred to their own epics.

> **Update 2026-08-26:** Both wire tickets are ✅ Done (commit `51a7bc01`):
> XP/loot mounted at `src/routes/rpg/xp-loot.ts`; combat mounted at `src/routes/rpg/combat.ts`.
> Remaining work is combat DB persistence, the barrel, and the registry module below.

## Tasks

- [x] Wire XP & loot routes — `TASK-wire-xp-loot-routes` (✅ 2026-08-14, `51a7bc01`, `src/routes/rpg/xp-loot.ts` + tests)
- [x] Wire combat routes as stateless resolution endpoints — `TASK-wire-combat-routes` (✅ 2026-08-14, `51a7bc01`, `src/routes/rpg/combat.ts` + tests)
- [ ] Mechanics registry system (via routes/rpg.ts)
      ↳ carried from parent; registration currently lives inline in routes — see next task
- [ ] Extract mechanics registry into plugin-based `src/rpg/registry.ts` (Dice, Stats, Combat, Inventory, Skills, XP, Quests, Achievements, Buffs, Items, Custom — built-ins under `plugins/core/`)
- [ ] Create `src/rpg/index.ts` barrel re-exporting dice/stats/combat/xp/loot public APIs
- [ ] Combat DB persistence schema in `src/db/schema-rpg.ts` (persist battles/rounds/outcomes; engine logic stays pure)

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

The registry is the mechanism governance (per-world enable/disable — see
`epic-mechanics-governance.md`) toggles against. Registration entries map mechanic id →
route factory + service module so per-world config can gate mounts.

## Dependencies

- **Parent hub:** epic-rpg-mechanics.md (integration matrix, shared contracts `DiceRoll` / `CharacterStats` / `SkillCheck`)
- **Depends on:** Phase-1 modules (done): `src/rpg/{dice,stats,combat,xp,loot}`, `src/db/schema-rpg.ts`
- **Siblings:** ALL other sub-epics register through the registry built here; `epic-mechanics-governance.md` (SECOND in sequence) gates per-world rollout on top of it
- **External consumers:** Battle & Action, Magic & Spell, Economy & Trading, NSFW, Social, Exploration, Weather, Faction (see parent matrix)

## Files

- `src/routes/rpg/xp-loot.ts` — XP/loot routes (wired 2026-08-14)
- `src/routes/rpg/combat.ts` — combat resolution routes (wired 2026-08-14)
- `src/rpg/service/xp.ts`, `src/rpg/service/loot-tables.ts` — persistence services (migration 026)
- `src/rpg/index.ts` — barrel (not yet implemented)
- `src/rpg/registry.ts` — mechanics registry (not yet implemented)

## Linked Tickets

- TASK-wire-xp-loot-routes.md (✅ done)
- TASK-wire-combat-routes.md (✅ done)

## Open Questions

- Should combat persistence store full round-by-round logs or only outcomes (storage vs replay)?
- Does the registry need hot-reload semantics once `plugins/core/` mechanics ship (see Plugin System epic)?
