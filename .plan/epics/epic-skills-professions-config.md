<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RPG Skills, Professions & Config Templates

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** skills, professions, character, config, templates, seeding, rpg

## Summary

Three gaps identified: (1) **Skills & Professions** have DB tables + services but **zero HTTP routes** and **no frontend** — unreachable; (2) **Character templates** in config have no `skills`/`professions` fields — seeded characters start with empty skill sheets; (3) **Item templates** don't exist in config at all — no idempotent item seeding on server start. This epic closes all three.

## Current State Assessment

| System              | DB Tables                                         | Service                     | Routes  | Frontend | Config Templates           | Seeding     |
| ------------------- | ------------------------------------------------- | --------------------------- | ------- | -------- | -------------------------- | ----------- |
| Skills              | `character_skills` (036)                          | ✅ `SkillsService`          | ❌ none | ❌ none  | ❌ none                    | ❌ none     |
| Professions         | `professions`, `profession_specializations` (011) | ❌ none                     | ❌ none | ❌ none  | ❌ none                    | ❌ none     |
| Character templates | —                                                 | ✅ `seedCharacterTemplates` | —       | —        | ✅ exists (no skills/prof) | ✅ on start |
| Item templates      | —                                                 | ❌ none                     | —       | —        | ❌ none                    | ❌ none     |

## Key Issues

### 🔴 Critical

| # | Issue                                                                                                | Impact                    |
| - | ---------------------------------------------------------------------------------------------------- | ------------------------- |
| 1 | **Skills unreachable** — `SkillsService` exists, `character_skills` table exists, but no HTTP routes | Dead code                 |
| 2 | **Professions unreachable** — `professions` table exists, no service, no routes                      | Dead code                 |
| 3 | **No item config templates** — items can't be seeded from config like characters can                 | Manual item creation only |

### 🟡 High

| # | Issue                                                                                                              | Impact                  |
| - | ------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| 4 | **Seeded characters have no skills** — templates lack `skills`/`professions` fields                                | Empty skill sheets      |
| 5 | **No skill frontend** — character panel shows no skill tree, progression, or specialization                        | No gameplay visibility  |
| 6 | **Professions not linked to skills** — crafting disciplines exist in `professions` table but no service wires them | No crafting progression |

## Sub-Tasks

| Task                                          | Scope                                                                          | Priority |
| --------------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| `TASK-skills-routes.md`                       | Expose `SkillsService` via HTTP (CRUD, XP, tree, prerequisites)                | P0       |
| `TASK-professions-service-routes.md`          | Create `ProfessionsService` + routes for profession progression                | P0       |
| `TASK-character-config-skills-professions.md` | Extend `CharacterTemplate` with `skills[]` + `professions[]` fields, seed them | P1       |
| `TASK-item-config-templates.md`               | Create item template config section + idempotent item seeding on start         | P1       |
| `TASK-skills-frontend.md`                     | Skill tree UI, progression display, specialization in character panel          | P2       |
| `TASK-professions-frontend.md`                | Profession UI: level, discipline, bonuses, crafting station link               | P2       |

## Acceptance Criteria

- [ ] Skills CRUD + XP + tree + prerequisites accessible via HTTP
- [ ] Professions CRUD + progression + specializations accessible via HTTP
- [ ] Seeded characters from config include their declared skills
- [ ] Seeded characters from config include their declared professions
- [ ] Item templates in config seed idempotently on server start
- [ ] Items link to unified `ItemCategory`/`ItemRarity` taxonomy
- [ ] Skill tree visible in character panel (frontend)
- [ ] Profession level + bonuses visible in character panel (frontend)
- [ ] `bun run check` green; all new code covered by tests

## Related Epics

- `epic-skills.md` — aspirational skills spec (this epic makes it real)
- `epic-crafting-professions.md` — crafting professions (this epic wires the service)
- `epic-rpg-mechanics.md` — RPG mechanics umbrella
- `epic-item-systems-unification.md` — item type taxonomy (skills reference items)
- `epic-character-core-system.md` — character system (skills extend it)

## Files Referenced

- `src/rpg/skills/service/index.ts` — SkillsService (no routes)
- `src/rpg/skills/service/types.ts` — Skill, SkillCategory, ProficiencyLevel
- `src/db/schema-core.ts:630-647` — character_skills table
- `src/db/schema-crafting.ts:86-111` — professions table
- `src/characters/seed/templates.ts` — character seeder (extend for skills/prof)
- `src/config/sections/characters/types.ts` — CharacterTemplate (add skills/prof)
- `src/config/sections/characters/defaults.ts` — default templates (add examples)
- `src/server/start.ts:163-192` — seeding entry point (add item seeding)
