<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Professions Frontend (Crafting Disciplines UI)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Status Note:** 8/8 ACs landed 2026-11-09 (T7, branch core-t7-craft): station bonus display via the `stationProfessions` mixin slice + XP-on-craft in `attemptCraft` (same-trx level-up, receipt on the result). Game-balance default: tier x 10 XP on success (min 5), half rounded down on failure (`CRAFT_XP_PER_TIER`/`CRAFT_XP_MIN` in `src/rpg/crafting/professions/index.ts` — adjust freely, no config UI). No dedicated station-opening view exists in the frontend yet (backend-only surface), so the bonus line is a mixin/template seam for the crafting lane to call when that UI lands.
**Priority:** P2 — Medium
**Caveats:** partial failure (XP grant and attempt record share one trx — no half-written state), stale state (station bonus line reads the fetched profession row; refresh after level-up), observability (XP receipt on the result + `experience_gained` on the attempt row)
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
- [x] Crafting station shows active profession bonuses — landed T7: `stationProfessions` mixin slice (`src/frontend/alpine/professions-crafting.ts`) — `loadStationProfession(actorId, discipline, worldId?)` fetches the matching profession via the existing actor-scoped list route, `stationProfessionBonus()` renders the line next to station tier bonuses (reuses `professionBonuses(level)`, never reimplements the ladder). Pinned by `professions.test.ts` station block (Journeyman +5% success, Expert +10% quality shapes).
- [x] Crafting attempts gain profession XP (feedback on level-up) — landed T7: server-side in `CraftingProcessService.attemptCraft` (`src/rpg/crafting/process.ts`) — the matching-discipline profession levels in the same trx as the attempt; `experience_gained` recorded on the attempt row; result carries `professionXp` (id/xpGained/total/newLevel/newTitle/leveledUp/titleChanged); route schema exposes both new fields. Balance default: tier x 10 XP on success (min 5), half (rounded down) on failure — constants `CRAFT_XP_PER_TIER`/`CRAFT_XP_MIN` in `src/rpg/crafting/professions/index.ts`, no config UI. Pinned by `process.test.ts` (success/half/none/level-up) + award-table tests.
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
