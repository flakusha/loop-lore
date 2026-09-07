<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: unify /roll RNG onto crypto dice engine + log history

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-rpg-mechanics.md

## Summary

Gap G1/G2 (verified): src/assistant/commands/dice.ts:82 uses Math.random while src/rpg/dice/roll.ts has cryptoRandomInt; /roll never writes dice_roll_history. Route /roll through rollDice(), log every roll via logDiceRoll, keep chat output format. No schema change. Plan: docs/meta/code-practices-improvements/rpg-opt-in-systems-plan.md §3.1. Epic: epic-rpg-mechanics.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
