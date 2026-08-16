<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG Stats Frontend Wiring

**Status:** ⬜ Not Started
**Priority:** P0
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Tags:** rpg, frontend, wiring, stats

## Summary

Wire the existing `rpg-stats.ts` mock data component to real backend API endpoints at `/api/rpg/stats/*`. Currently the RPG stats panel in the character info sidebar renders hardcoded mock data (level 1, HP 12, etc.) with no API calls.

## Current State

- `src/frontend/alpine/rpg-stats.ts` — uses hardcoded mock data (lines 17-47)
- `src/components/chat/character-info-panel.html` — renders RPG stats (HP/MP bars, STR/DEX/CON/INT/WIS/CHA, XP bar)
- Backend routes exist at `src/routes/rpg.ts` (6 endpoints under `/api/rpg/`)

## What to Implement

1. Replace `loadRpgStats()` mock data with actual API call to `/api/rpg/stats/:actorId`
2. Add stat update endpoint integration for real-time stat changes
3. Add equipment slot display (connect to `/api/rpg/` equipment routes if they exist)
4. Add status effect badges (connect to `/api/rpg/` buff/debuff routes)
5. Wire XP bar to real XP data from backend

## Backend Routes (already exist)

| Route                      | Method | Purpose               |
| -------------------------- | ------ | --------------------- |
| `/api/rpg/dice/roll`       | POST   | Roll dice             |
| `/api/rpg/dice/notation`   | POST   | Parse dice notation   |
| `/api/rpg/dice/advantage`  | POST   | Roll with advantage   |
| `/api/rpg/stats/calculate` | POST   | Calculate stat totals |
| `/api/rpg/stats/validate`  | POST   | Validate stat array   |
| `/api/rpg/stats/generate`  | POST   | Generate random stats |

## Files to Modify

- `src/frontend/alpine/rpg-stats.ts` — Replace mock data with API calls
- `src/components/chat/character-info-panel.html` — Add loading states, error handling

## Acceptance Criteria

- [ ] RPG stats panel loads real data from backend
- [ ] HP/MP/XP bars reflect actual character state
- [ ] Stat modifiers calculate correctly from backend
- [ ] Loading and error states display properly
- [ ] Tests pass

## Related

- `TASK-character-rpg-stats.md` — Backend RPG stats system
- `epic-rpg-mechanics.md` — RPG mechanics epic
