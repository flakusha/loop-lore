<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: Resolution System

**Status:** 🟡 In Progress (split into implementing tickets — see below)
**Priority:** high
**Effort:** Medium
**Epic:** epic-resolution-system

## Summary

Resolution system: d20-based resolution family decision, skill checks, difficulty classes, advantage/disadvantage. From Epic 22 sub-system. Blocks combat implementation.

## Implementation (split tickets, filed 2026-09-07/08)

- `TASK-rpg-actor-resolved-skill-checks-from-character-sheets.md` — `resolveActorSkillCheck` (sheet → mod + proficiency → `makeSkillCheck`)
- `TASK-rpg-check-chat-command-with-modifier-breakdown.md` — `/check` surface + history logging
- `TASK-rpg-pure-ability-checks-outside-combat.md` — `resolveAbilityCheck`, `/check str` vs `/check athletics`

This stub stays open until all three land.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
