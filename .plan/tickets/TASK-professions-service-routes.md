# TASK: Professions Service & Routes (Crafting Disciplines)

**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-skills-professions-config
**Tags:** professions, crafting, service, routes, backend

## Summary

The `professions` and `profession_specializations` tables exist (migration `011_crafting_professions.ts`) but have **no service and no routes**. Professions represent a character's crafting discipline (Alchemy, Smithing, etc.) with level, XP, title, and specializations. This task creates the service and HTTP routes.

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
4. **Link to crafting** — crafting attempts check profession level for success/quality bonuses
5. **Register** — wire into `src/routes/rpg/index.ts`

## Acceptance Criteria

- [ ] `ProfessionsService` with CRUD + XP + progression + specializations
- [ ] All 5 profession endpoints functional with validation
- [ ] XP gain triggers level-up + title change when thresholds met
- [ ] Profession bonuses (success, quality, speed) computed from level
- [ ] Discipline enum matches crafting disciplines (alchemy, smithing, etc.)
- [ ] Ownership-gated (actor owner or admin)
- [ ] `bun test src/` green; `bun run check` green

## Files to Create

- `src/rpg/crafting/professions/index.ts` — ProfessionsService
- `src/rpg/crafting/professions/types.ts` — profession types
- `src/rpg/crafting/professions/crud.ts` — CRUD dispatchers
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
