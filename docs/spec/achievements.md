<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Achievements & Badges Specification

> Promoted 2026-09-18 from STUB. Authoritative source is `src/` and AGENTS.md.

## Overview

Achievements are narrative / mechanical milestones awarded through the RPG progression layer. Implementation lives in `src/rpg/achievements/` with `service/` providing the award / query API.

## Scope

- Achievements are awarded on RPG events (level-up, quest complete, crafting milestone, NPC trust threshold).
- Surfaced via actor profile and chat header as cosmetic badges.
- No first-class DB table — achievements ride on actor `properties.achievements` JSON column.

<!-- GAP: dedicated `achievements` table for cross-actor aggregation (leaderboards, shared achievements) is aspirational. -->

## Technical Design

- **Service:** `src/rpg/achievements/service/` exposes `award()`, `listForActor()`, `listEarned()`.
- **Triggering:** RPG event hooks in `src/rpg/xp/sources.ts`, `src/rpg/crafting/process.ts`, `src/rpg/service/character-stats.ts`.
- **Format:** structured `{ id, name, description, awardedAt }` records on actor.

## Integration Points

- `src/rpg/achievements/service/` — award / query API
- `src/rpg/xp/sources.ts` — XP-driven awards
- `src/rpg/crafting/process.ts` — crafting-milestone awards
- `src/characters/mood.ts` — mood-driven achievement hints

## Related Epics

- `.plan/epics/epic-achievements.md`
- `.plan/epics/epic-rpg-progression.md`
