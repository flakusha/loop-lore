<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: RPG Skill Points On Level Up

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** (see ## Summary below)
**Context:** (see ## Summary — same block)
**Acceptance Criteria:** (see ## Acceptance Criteria below)
**Epic:** epic-skills

## Summary

Award skill points to actors on character level up. Reuse src/rpg/service/character-stats.ts level-up pathway: when level increases by N, grant skillPoints = N * pointsPerLevel (config-driven in src/config/, default 1). Persist on actors.metadata JSON column (new key 'skill_points_available'). Wire into existing addXp path (src/rpg/skills/service/crud.ts) when actor's overall level crosses thresholds. Endpoint: GET /api/rpg/skills/actors/:actorId/points. Test in src/rpg/skills/service.test.ts. Epic: epic-skills.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
