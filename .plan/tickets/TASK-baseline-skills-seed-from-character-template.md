<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Baseline Skills Seed From Character Template

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** (see ## Summary below)
**Context:** (see ## Summary — same block)
**Acceptance Criteria:** (see ## Acceptance Criteria below)
**Epic:** epic-skills

## Summary

Seed baseline skills per character template. Reuse existing SkillsService.createSkill() (src/rpg/skills/service/crud.ts) with acquisitionSource='baseline' (default). When a character is created/migrated and a baseline-skills list exists in src/config/characters/ (or src/db/seeds/), insert them via POST /api/rpg/skills in a transaction. Default skill points: 0 (until TASK-rpg-skill-points-on-level-up lands). Tests: extend src/rpg/skills/service.test.ts with a baseline-seeding case. Epic: epic-skills.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
