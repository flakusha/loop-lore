<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: timed conditions/buffs with stat deltas

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-rpg-progression.md

## Summary

Gap G8 (verified): conditions in two disconnected places (combat-local gating vs sheet JSON never consumed); no stat deltas or expiry. Add addCondition(actorId,{condition,statDeltas,expires}) on sheet; modifier hook in skill/ability/attack resolvers (blessed +1d4, poisoned disadvantage, no double-stacking); expiry on rounds + wall-clock. Scope to combat/conditions.ts list first. Plan doc batch 2 #8. Epic: epic-rpg-progression.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
