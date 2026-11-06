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
  - AC overstated (2026-11-04 correction, authz-hardening lane — honest trail, no history rewrite): at the time this AC was ticked, only the actor-scoped routes (POST `/`, GET `/actors/:actorId`) were gated; the id-scoped trio (GET `/:id`, POST `/:id/xp`, POST `/:id/specialize`) was authN-only (`requireUserId`) — any authenticated user could read/mutate any actor's profession (IDOR). Hardened with row-level `checkActorOwnership` gates (byte-identical 404 for missing/not-owned, 401 for anonymous) + negative-path tests in this branch; tracked as BUG-profession-id-scoped-routes-allow-cross-user-read-mutate-ido (issue b21af33), fixed in the `fix(security): row-level ownership on rpg profession/skill id routes` commit.
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

## Review follow-ups (2026-11-06, branch professions-service-routes)

1. **world_id scoping (BLOCKING, FIXED):** `CraftingProcessService.attemptCraft`
   looked up `professions` by `(actor_id, discipline)` only
   (`src/rpg/crafting/process.ts:290-293`), but the unique index is
   `(actor_id, world_id, discipline)` (`095:60-62`, `096:40-43`). Same actor
   holding the same discipline in two worlds got the first row's bonuses in
   both. Fixed by threading `opts.worldId` into the lookup
   (`process.ts:290-296`); the request already carries `worldId`
   (`CraftAttemptOpts.worldId`, `src/rpg/crafting/types.ts:15`), so no
   signature change. Regression tests in `process.test.ts`: same-world
   Grandmaster row applies bonuses; other-world sibling row is ignored.

2. **fe-be-harmony FLAG `FE-no-BE: POST /api/rpg/professions` — CHECKER-ARTIFACT
   (no product change):** the route EXISTS as `.post(R, ...)` with
   `const R = \`${prefix}/rpg/professions\`` (`src/routes/rpg/professions.ts:68,72`),
   mounted via `professionsRoutes(opts, prefix)` in the facade
   (`src/routes/rpg/index.ts:113`), itself `.use()`d under `/api/v1`
   (`src/routes/v1/actors-surface.ts:91`, `src/routes/v1/index.ts:62`) and
   reachable as `POST /api/rpg/professions` (proven by route test
   `src/routes/rpg/professions.test.ts:88-103` hitting exactly that URL → 201;
   FE caller `src/frontend/alpine/professions.ts:110`). The checker's
   `scanBe` regex only captures literal call-site arguments to
   `.(get|post|...)` (`be-routes.ts:66`) and resolves `${prefix}`/`${R}`
   against file-scope `const` defaults (`be-routes.ts:24-51,54-62`) — so the
   bare identifier `R` in `.post(R, ...)` never expands and the route is
   invisible to the checker. Blind spot is generic: sibling `skills.ts:119`
   `.post(R, ...)` is likewise missing from the scan (only `:id/xp` +
   `:id/specialize` from the template-literal call sites appear).

3. **Generator BLAST RADIUS (flagged, code left alone per assignment):** this
   branch changed `scripts/generate-db-types.ts:111-121` and
   `scripts/generate-schema-manifest.ts:88-98` so a later re-add wins over an
   earlier drop GLOBALLY (needed for 095/096's `world_id` drop+re-add
   nullability change). That inverts drop semantics for every future table:
   any migration that drops a column and later re-adds an unrelated same-named
   column will silently keep the new def. Recommendation: scope the rule to
   `professions` (or revert after landing) — follow-up owned by the
   generator maintainers, not this branch.
