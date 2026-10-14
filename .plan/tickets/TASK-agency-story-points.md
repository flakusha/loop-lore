<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Player Agency — Story Points

**Summary:** Schema ships (migration 019_actor_story_points.ts). Earn/spend/balance service implemented. Spend validation + generation-pipeline hook open in TASK-storypoints-acceptance.
**Context:** actor_story_points table with per-actor/world balance, earned_total, spent_total, cap. Concurrency-safe earn (relative UPDATE + ON CONFLICT DO NOTHING). Read-only balance query.
**Acceptance Criteria:**

- [x] actor_story_points table (migration 019)
- [x] earnStoryPoints — concurrency-safe earn with cap enforcement
- [x] spendStoryPoints — concurrency-safe spend with insufficient check
- [x] getStoryPointBalance — read-only balance query
- [ ] Spend validation rules (TASK-storypoints-acceptance)
- [ ] Generation-pipeline hook (TASK-storypoints-acceptance)
- [x] POST /api/agency/earn HTTP route (src/routes/agency/earn.ts, wired in index.ts)


**Status:** In Progress
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-agency-story-points

## Summary

Bennies / Fate Points / Inspiration: a player-earned meta-currency spent to influence narrative, reroll dice, or trigger special abilities. From `epic-agency-story-points.md`.

## Scope

### Story Points Mechanics

- Earn points (good roleplay, completing arcs, achievements)
- Spend points (reroll, influence narrative, trigger abilities)
- Point limits and caps

### Integration Points

- **RPG Mechanics** — Dice rerolls, stat bonuses
- **Narrative System** — Influence story outcomes
- **Achievement System** — Earn points for achievements

## Linked Epics

- `epic-agency-story-points.md`

## Acceptance Criteria

- [x] actor_story_points table (migration 019)
- [x] earnStoryPoints — concurrency-safe earn with cap enforcement
- [x] spendStoryPoints — concurrency-safe spend with insufficient check
- [x] getStoryPointBalance — read-only balance query
- [ ] Spend validation rules (TASK-storypoints-acceptance)
- [ ] Generation-pipeline hook (TASK-storypoints-acceptance)
- [x] POST /api/agency/earn HTTP route (src/routes/agency/earn.ts, wired in index.ts)

## Notes

- Reference `epic-agency-story-points.md` for full system design
- Consider balance between earning and spending
- Reference TTRPG systems (Savage Worlds, FATE, D&D Inspiration)
