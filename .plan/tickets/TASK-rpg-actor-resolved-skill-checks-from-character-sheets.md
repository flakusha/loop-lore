<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: actor-resolved skill checks from character sheets

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-rpg-mechanics.md

## Summary

Gap G3 (verified): SKILL_ABILITY consumed only inside src/rpg/stats/; no resolveSkillBonus/actorSkillCheck exists repo-wide; battle makeSkillCheck(skillBonus,dc) takes a raw number. Add resolveActorSkillCheck(actorId,skill,dc) in src/rpg/: sheet lookup (character-stats service) -> SKILL_ABILITY -> ability mod + proficiency(level) + conditions -> delegate to makeSkillCheck. Pure + unit-tested; no caller migration in this ticket. Plan doc §3.2. Epic: epic-rpg-mechanics.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
