<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Achievements & Badges Specification

> **Status:** Largely implemented — DB tables, service, and routes all exist; cross-actor aggregation and badge UI are aspirational. Authoritative source is `src/` and AGENTS.md.

## Implemented

- Tables: `achievements` and `player_achievements` (`src/db/migrations/001_init.ts` ~L2765/L2844). An earlier revision of this spec claiming "no first-class DB table — achievements ride on actor `properties.achievements` JSON" was false.
- Service: `src/rpg/achievements/service/` — `AchievementsService` with definition CRUD (`createAchievement`, `getAchievement`, `listAchievements`, `updateAchievement`, `deleteAchievement`) and player progress (`getPlayerAchievements`, `getPlayerAchievement`, `isUnlocked`, `updateProgress`, `claimRewards`, `getPlayerStats`).
- Routes: `/api/rpg/achievements` definition CRUD + `.../player/...` progress and rewards (`src/routes/rpg/achievements.ts`, `src/routes/rpg/achievements-player.ts`, mounted in `src/routes/rpg/index.ts`).
- Types: `AchievementCategory`, `AchievementTier`, unlock conditions (`src/rpg/achievements/service/types.ts`).
- Note: `.plan/epics/epic-achievements.md` status line ("UNWIRED — routes pending") is stale — routes are mounted under `/api/rpg`.

## Not implemented / aspirational

- Cross-actor aggregation (leaderboards, shared achievements) and badge display surfaces (actor profile / chat header cosmetics).

## Epics

- `.plan/epics/epic-achievements.md`
- `.plan/epics/epic-rpg-content-systems.md`
- `.plan/epics/epic-rpg-progression.md`
