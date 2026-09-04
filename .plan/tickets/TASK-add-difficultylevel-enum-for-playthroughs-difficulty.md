<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add DifficultyLevel enum for playthroughs.difficulty

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-achievements

## Summary

Replace string-typed difficulty in playthroughs with DifficultyLevel enum (normal, hard, nightmare, absurd). The 035_achievements_replayability.ts migration defaults to 'normal'. Must create src/db/enums-core/difficulty-level.ts with enum, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
