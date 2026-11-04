<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Professions Frontend (Crafting Disciplines UI)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** landed 2026-11-04 in worktree `professions-service-routes` (authz-hardening/frontend slice) — landed-reality notes inline on the ACs below; the two crafting-integration ACs are NOT done (out of slice, see notes).
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

- [x] Professions displayed in character panel with discipline + title + level (landed: `character/professions-panel.html` in character-info-panel; no `characters.html` tab — recorded deviation)
- [x] XP progress bar toward next title threshold (landed: `rpg-progress-track/fill` bar + `nextTitleAt` hint; client mirror pinned against `progression.ts` by test)
- [x] Bonus summary visible (success%, quality%, speed%, material saving) (landed: per-row bonuses line from the title-ladder mirror)
- [x] Specializations listed with bonus descriptions (landed: `selectProfession` → GET /:id → spec list with bonus + requirement level)
- [ ] Crafting station shows active profession bonuses — **NOT done**: crafting-station UI wiring is out of this slice (separate crafting lane); the bonuses data is available via `professionBonuses(level)` for that lane to consume.
- [ ] Crafting attempts gain profession XP (feedback on level-up) — **NOT done**: no XP-on-craft wiring exists server-side or client-side; honest deviation, needs its own ticket/lane decision (XP economy value is a game-balance call).
- [x] Mobile responsive (collapsible panel + rows)
- [x] `bun test src/frontend` green; `bun run check` green (landed: BUN_TEST_WORKER_ID=1 bun test src/frontend/alpine/professions.test.ts + skill-tree.test.ts → 20 pass / 0 fail; check:fast ALL PASS 2026-11-04)

**Landed files deviation:** `src/routes/crafting/attempts.ts` not touched (see unticked crafting ACs); assign flow added (`POST /api/rpg/professions` with discipline picker filtered to un-held disciplines) beyond the ticket sketch.

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
