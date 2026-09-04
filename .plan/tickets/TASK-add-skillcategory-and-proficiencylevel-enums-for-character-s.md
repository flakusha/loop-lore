<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add SkillCategory and ProficiencyLevel enums for character_skills

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-character-core-system

## Summary

Replace string-typed category and string-typed proficiency in character_skills with strictly typed enums. SkillCategory: combat, social, crafting, stealth, magic. ProficiencyLevel: novice, apprentice, journeyman, expert, master. The 012_features.ts migration has category as raw string and proficiency as Generated<string>. Must create src/db/enums-core/skill-enum.ts with enums, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
