<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add FantasyCategory and IntensityLevel enums for character_fantasies

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-character-core-system

## Summary

Replace string-typed category/intensity in character_fantasies with strictly typed enums. FantasyCategory: identity, personality, physical, background. IntensityLevel: mild, moderate, intense. The 012_features.ts migration has these as raw strings. Must create src/db/enums-core/character-fantasy.ts with enums, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
