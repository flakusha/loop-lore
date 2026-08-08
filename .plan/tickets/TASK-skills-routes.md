# TASK: Skills Routes (Expose SkillsService via HTTP)

**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-skills-professions-config
**Tags:** skills, routes, http, backend, api

## Summary

`SkillsService` in `src/rpg/skills/service/index.ts` is fully implemented with CRUD, XP, progression, tree building, and prerequisite checking — but has **zero HTTP routes**. This task exposes it via Elysia routes under `/api/rpg/skills`.

## Current State

`SkillsService` methods:
- `createSkill(input)`, `getSkill(id)`, `updateSkill(id, input)`, `deleteSkill(id)`
- `getActorSkills(actorId, worldId?)`, `getSkillsByCategory(actorId, category, worldId?)`
- `addXp(skillId, xpAmount)`, `specializeSkill(skillId, specialization)`
- `checkPrerequisites(actorId, prerequisites, worldId?)`, `buildSkillTree(actorId, worldId?)`

All dead code without routes.

## Work

1. **Skills routes** — `src/routes/rpg/skills.ts`:
   - `GET /api/rpg/skills/:skillId` — get one skill
   - `GET /api/actors/:actorId/skills` — list actor's skills (optional `?worldId=`, `?category=`)
   - `POST /api/actors/:actorId/skills` — create skill
   - `PUT /api/rpg/skills/:skillId` — update skill
   - `DELETE /api/rpg/skills/:skillId` — delete skill
   - `POST /api/rpg/skills/:skillId/xp` — add XP (body: `{ amount }`)
   - `POST /api/rpg/skills/:skillId/specialize` — specialize (body: `{ specialization }`)
   - `GET /api/actors/:actorId/skill-tree` — get skill tree
   - `POST /api/rpg/skills/:skillId/prerequisites` — check prerequisites
2. **Ownership checks** — verify the requesting user owns the actor or is admin
3. **Validation** — use Elysia `t` schemas for body/params (name, category, level, etc.)
4. **Register** — wire into `src/routes/rpg/index.ts` and `src/app/register-plugins.ts`

## Acceptance Criteria

- [ ] All 9 skill endpoints functional with validation
- [ ] XP gain triggers level-up + proficiency change when thresholds met
- [ ] Skill tree endpoint returns hierarchical structure with unlock status
- [ ] Prerequisites check returns `{ met: boolean, missing: string[] }`
- [ ] Ownership-gated (actor owner or admin)
- [ ] OpenAPI docs generated for all endpoints
- [ ] `bun test src/` green; `bun run check` green

## Files to Create

- `src/routes/rpg/skills.ts` — skill HTTP routes

## Files to Modify

- `src/routes/rpg/index.ts` — register skills routes
- `src/app/register-plugins.ts` — register RPG plugins

## Related

- `epic-skills.md` — aspirational skills spec
- `TASK-professions-service-routes.md` — professions routes (parallel)
- `TASK-skills-frontend.md` — consumes these endpoints
- `TASK-character-config-skills-professions.md` — seeds skills that these routes serve
