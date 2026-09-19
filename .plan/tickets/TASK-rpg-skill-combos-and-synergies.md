<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: RPG Skill Combos and Synergies

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

**Summary:** (see ## Summary below)
**Context:** (see ## Summary — same block)
**Acceptance Criteria:** (see ## Acceptance Criteria below)
**Epic:** epic-skills

## Summary

Add skill combos/synergies bonus system to SkillsService (src/rpg/skills/). Combo: when an actor has multiple skills with a shared tag (e.g. 'fire'), grant a derived stat bonus in src/rpg/service/character-stats.ts. Synergy: explicit pair lookup in a new skill_synergies table (migration: append-only, add migration for skill_synergies(skill_a_id, skill_b_id, bonus json, world_id)). New endpoint: GET /api/rpg/skills/actors/:actorId/combos (returns active combos + applied modifiers). Reuse existing buildSkillTree() in tree.ts. Close: epic-skills acceptance 'Skill combos and bonus effects'. Tests: src/rpg/skills/service.test.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
