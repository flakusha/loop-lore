<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Professions Frontend (Crafting Disciplines UI)

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Medium
**Epic:** epic-skills-professions-config
**Tags:** professions, crafting, frontend, ui, character

## Summary

No frontend exists for professions. After `TASK-professions-service-routes.md` creates the service and `TASK-character-config-skills-professions.md` seeds professions, this task builds the UI to display crafting disciplines, levels, bonuses, and specializations.

## Current State

- `professions` table exists with `discipline, level, experience, title`
- `profession_specializations` table exists with bonuses
- No service, no routes, no frontend currently

## Work

1. **Profession display** — `src/frontend/alpine/professions.ts`:
   - List actor's professions with: discipline icon, title, level, XP bar
   - Title badge: Apprentice / Journeyman / Expert / Master / Grandmaster
   - Bonus summary: +X% success, +Y% quality, +Z% speed
2. **Profession detail panel**:
   - Full progression: current level → next title threshold
   - Active specializations with bonus descriptions
   - Unlock requirements for next specialization
   - "Add XP" (for testing/GM) → calls profession XP endpoint
3. **Crafting integration** — link profession to crafting:
   - When opening crafting station, show relevant profession bonus
   - "Your Smithing (Expert): +10% quality, +5% success"
   - Crafting attempts gain profession XP
4. **Character panel integration** — add "Professions" section:
   - Summary: number of disciplines, highest title
   - Quick view: top professions by level

## Acceptance Criteria

- [ ] Professions displayed in character panel with discipline + title + level
- [ ] XP progress bar toward next title threshold
- [ ] Bonus summary visible (success%, quality%, speed%, material saving)
- [ ] Specializations listed with bonus descriptions
- [ ] Crafting station shows active profession bonuses
- [ ] Crafting attempts gain profession XP (feedback on level-up)
- [ ] Mobile responsive
- [ ] `bun test src/frontend` green; `bun run check` green

## Files to Create

- `src/frontend/alpine/professions.ts` — profession Alpine mixin
- `src/components/character/professions-panel.html` — profession panel template

## Files to Modify

- `src/views/characters.html` — add professions tab/section
- `src/routes/crafting/attempts.ts` — gain profession XP on craft

## Related

- `TASK-professions-service-routes.md` — consumes these endpoints
- `TASK-character-config-skills-professions.md` — seeds professions to display
- `TASK-skills-frontend.md` — parallel: skill tree UI
- `TASK-wire-crafting-routes.md` — crafting uses profession bonuses
