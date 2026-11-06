<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Config — Skills & Professions in Templates

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-skills-professions-config
**Tags:** skills, professions, character, config, templates, seeding

## Summary

Character templates in `src/config/sections/characters/types.ts` (`CharacterTemplate`) have identity fields (species, gender, age) but **no skills or professions**. Seeded characters start with empty skill sheets. This task extends the config schema to include `skills[]` and `professions[]` in templates, seeds them on server start, and adds example data to defaults.

## Current State

```typescript
// src/config/sections/characters/types.ts — CharacterTemplate
interface CharacterTemplate {
  name, description, personality, scenario, ...
  species?, subrace?, gender?, age?, homeland?, culture?  // ← identity only
  // ❌ no skills
  // ❌ no professions
}
```

## Work

1. **Extend `CharacterTemplate`** — add:
   - `skills?: SkillTemplate[]` — starting skills with level/proficiency
   - `professions?: ProfessionTemplate[]` — starting disciplines with level
2. **Skill template type**:

   ```typescript
   interface SkillTemplate {
     name: string;
     category: SkillCategory; // combat, magic, crafting, etc.
     level?: number; // default 1
     proficiency?: ProficiencyLevel; // default "novice"
     specialization?: string;
   }
   ```

3. **Profession template type**:

   ```typescript
   interface ProfessionTemplate {
     discipline: CraftingDiscipline; // alchemy, smithing, etc.
     level?: number; // default 1
     specializations?: string[];
   }
   ```

4. **Update seeder** — `src/characters/seed/templates.ts`:
   - After creating actor, iterate `template.skills[]` → `SkillsService.createSkill()`
   - Iterate `template.professions[]` → `ProfessionsService.createProfession()`
   - Idempotent: check for existing skills/professions before seeding
5. **Update defaults** — `src/config/sections/characters/defaults.ts`:
   - Elara Nightwhisper: skills [Lore Mastery (knowledge, expert), Arcana (magic, journeyman)], profession [Enchanting (level 30)]
   - ARIA-7: skills [Hacking (knowledge, master), Engineering (crafting, expert)], profession [Engineering (level 50)]
   - Detective Morgan: skills [Investigation (knowledge, expert), Perception (exploration, journeyman)], profession: none
6. **Update config schema** — `src/config/sections/characters/section.ts` (JSON schema for validation)
7. **Migration** — no schema change needed (skills/professions use existing tables)

## Acceptance Criteria

- [x] `CharacterTemplate` has `skills[]` and `professions[]` optional fields (landed in `packages/core/src/config/sections/characters/types.ts`)
- [x] Seeded characters from config include their declared skills (seeder is `src/characters/seed/rpg-sheets.ts`, not the sketched `templates.ts`)
- [x] Seeded characters from config include their declared professions
- [x] Skills seeded with correct level + proficiency (`SkillsService.createSkill` gained optional level/proficiency params; defaults unchanged)
- [x] Professions seeded with correct discipline + level
- [x] Idempotent: re-seeding doesn't duplicate skills/professions (asserted in seed tests)
- [x] Default templates (Elara, ARIA-7, Morgan) have example skills/professions (Elara enchanting 30, ARIA-7 engineering 50, Morgan skills-only)
- [x] Config JSON schema validates skills/professions fields (`section.ts`)
- [x] `bun test src/` green; `bun run check` green (check:fast ALL PASS; 776 tests: 744 pass / 32 skip / 0 fail)

## Files to Create

- (none — all modifications)

## Files to Modify

- `src/config/sections/characters/types.ts` — add `SkillTemplate`, `ProfessionTemplate` (landed at `packages/core/src/config/sections/characters/types.ts`)
- `src/config/sections/characters/defaults.ts` — add example skills/professions (landed at `packages/core/src/config/sections/characters/defaults.ts`)
- `src/config/sections/characters/section.ts` — update JSON schema (landed at `packages/core/src/config/sections/characters/section.ts`)
- `src/characters/seed/templates.ts` — seed skills + professions (landed at `src/characters/seed/rpg-sheets.ts`)
- `src/config/schema/characters.ts` — update top-level config type (landed via `packages/core/src/config/sections/characters/`)

## Related

- `TASK-skills-routes.md` — skills endpoints (seeder calls these)
- `TASK-professions-service-routes.md` — professions endpoints
- `TASK-item-config-templates.md` — parallel: item templates in config
- `TASK-skills-frontend.md` — displays seeded skills
- `TASK-professions-frontend.md` — displays seeded professions

**Resolved:** 2026-11-06 registry-driven close: git issue 7f82d5a (registry tip: 1dd87779e Konstantin Fedotov Close issue)
