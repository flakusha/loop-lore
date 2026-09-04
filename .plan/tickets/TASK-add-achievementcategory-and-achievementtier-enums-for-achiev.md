<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add AchievementCategory and AchievementTier enums for achievements

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-achievements

## Summary

Replace string-typed category/tier in achievements with strictly typed enums. AchievementCategory: combat, social, exploration, crafting, story, meta. AchievementTier: bronze, silver, gold, platinum. The 035_achievements_replayability.ts migration has these as raw strings. Must create src/db/enums-core/achievement-type.ts with enums, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
