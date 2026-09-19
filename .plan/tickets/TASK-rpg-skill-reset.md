<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: RPG Skill Reset

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

**Summary:** (see ## Summary below)
**Context:** (see ## Summary — same block)
**Acceptance Criteria:** (see ## Acceptance Criteria below)

## Summary

Add skill reset functionality to SkillsService (src/rpg/skills/). Resets actor skill progression: clears XP, sets level back to 1, proficiency to Novice, removes specialization, keeps unlock state for skills the actor originally had baseline. New endpoint: POST /api/rpg/skills/actors/:actorId/reset with body {skillIds?: string[]} (omit = reset all). Reuse existing SkillsService.updateSkill() dispatcher pattern. Add tests in src/rpg/skills/service.test.ts. Epic: epic-skills (closes 'Skill reset functionality' acceptance criterion).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
