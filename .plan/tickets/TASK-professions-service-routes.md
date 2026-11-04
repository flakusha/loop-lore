<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Professions Service & Routes (Crafting Disciplines)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-skills-professions-config
**Tags:** professions, crafting, service, routes, backend

## Summary

The `professions` and `profession_specializations` tables exist (created in `001_init`, parts/009-crafting) but have **no service and no routes**. Professions represent a character's crafting discipline (Alchemy, Smithing, etc.) with level, XP, title, and specializations. This task creates the service and HTTP routes.

## Current State

**`professions` table**: `actor_id, world_id, discipline, level, experience, title`
**`profession_specializations` table**: `profession_id, name, description, bonus_type, bonus_value, requirement_level, is_active`

Both tables are empty — no code writes to them. The `epic-crafting-professions.md` defines the full discipline list (8 crafting + 6 gathering) and progression (Apprentice → Grandmaster).

## Work

1. **Create `ProfessionsService`** — `src/rpg/crafting/professions/`:
   - `createProfession(input)` — assign discipline to actor
   - `getProfession(actorId, discipline)` — get one
   - `getActorProfessions(actorId, worldId?)` — list all
   - `addExperience(professionId, amount)` — gain XP, level up, update title
   - `addSpecialization(professionId, spec)` — unlock specialization
   - `getProgression(level)` — compute title + bonuses from level
2. **Profession progression logic** — from `epic-crafting-professions.md`:
   - Levels 1-25: Apprentice, 26-50: Journeyman, 51-75: Expert, 76-99: Master, 100: Grandmaster
   - Bonuses: success %, quality %, speed %, material saving
3. **Routes** — `src/routes/rpg/professions.ts`:
   - `GET /api/actors/:actorId/professions` — list professions
   - `POST /api/actors/:actorId/professions` — assign discipline
   - `GET /api/rpg/professions/:professionId` — get one
   - `POST /api/rpg/professions/:professionId/xp` — add XP
   - `POST /api/rpg/professions/:professionId/specialize` — add specialization

   > **Deviation note:** landed routes use the sibling rpg-route convention under `/api/rpg/professions`, not the sketched `/api/actors/...` paths: `POST /api/rpg/professions` (assign; actorId in body), `GET /api/rpg/professions/actors/:actorId?worldId=` (list), `GET /api/rpg/professions/:id`, `POST /api/rpg/professions/:id/xp`, `POST /api/rpg/professions/:id/specialize`. Rationale: consistent with the other `/api/rpg/*` resource routers (skills, crafting); same note lives in the routes file header.
4. **Link to crafting** — crafting attempts check profession level for success/quality bonuses
5. **Register** — wire into `src/routes/rpg/index.ts`

## Acceptance Criteria

- [x] `ProfessionsService` with CRUD + XP + progression + specializations (landed as `index.ts`/`types.ts`/`progression.ts`; the `crud.ts` sketch was consolidated into `index.ts`)
- [x] All 5 profession endpoints functional with validation (landed at `/api/rpg/professions` sibling-convention paths, not the sketched `/api/actors/...` paths — see Work item 3)
- [x] XP gain triggers level-up + title change when thresholds met (`progression.ts`)
- [x] Profession bonuses (success, quality, speed) computed from level
- [x] Discipline enum matches crafting disciplines (alchemy, smithing, etc.) (`types.ts`)
- [x] Ownership-gated (actor owner or admin) via `requireNsfwActorAccess`
- [x] `bun test src/` green; `bun run check` green (check:fast ALL PASS; 776 tests: 744 pass / 32 skip / 0 fail)

## Files to Create

- `src/rpg/crafting/professions/index.ts` — ProfessionsService
- `src/rpg/crafting/professions/types.ts` — profession types
- `src/rpg/crafting/professions/progression.ts` — XP/level logic
- `src/routes/rpg/professions.ts` — profession HTTP routes

## Files to Modify

- `src/routes/rpg/index.ts` — register professions routes
- `src/db/enums-crafting.ts` — ensure all disciplines covered

## Related

- `epic-crafting-professions.md` — full profession design (disciplines, progression)
- `TASK-skills-routes.md` — skills routes (parallel)
- `TASK-wire-crafting-routes.md` — crafting uses profession bonuses
- `TASK-professions-frontend.md` — consumes these endpoints
- `TASK-character-config-skills-professions.md` — seeds professions
