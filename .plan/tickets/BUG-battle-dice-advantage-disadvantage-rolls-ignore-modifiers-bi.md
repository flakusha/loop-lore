<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: battle dice: advantage/disadvantage rolls ignore modifiers, biasing vs initial roll

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

## Observed
rollDice applies bonus/penalty modifiers to the initial roll's `total` (lines 90-94), then checks advantage/disadvantage by comparing `advantage.total > total` (line 101) — but advantage.total is RAW, without modifiers applied. When bonus > 0 the initial roll is boosted, the advantage roll isn't, so the comparison systematically skews against advantage (undervalues it). Same inversion for disadvantage: the disadvantaged roll is unboosted.

## Expected
Both rolls should be on equal footing. Either apply modifiers to BOTH the initial roll and the advantage/disadvantage roll before comparison, or apply modifiers to the final selected total after the advantage/disadvantage branch.

## Evidence
- src/battle/integration-schemas/dice.ts:90-94 — modifiers added to initial `total`.
- src/battle/integration-schemas/dice.ts:100-104 — `advantage = rollSet(sides, count)` produces raw totals without modifiers.
- reproduction: rollDice('d20', 1, [{type:'bonus', value:5}, {type:'advantage', value:0}]). Initial raw=15, total=20. Advantage raw=12, total=12. 12 > 20? no → keep initial 20. With symmetric handling the advantage roll becomes 17 (12+5) > 20? no → still 20. But initial raw=10, total=15, advantage raw=18 → raw=18 (without bonus) loses to 15, while bonus-applied=23 wins. Advantage becomes the wrong call systematically when initial+bonus < raw advantage.

## Severity
medium

## Fix direction
Apply bonus/penalty to the advantage/disadvantage total as well, OR move the modifier application to AFTER the advantage/disadvantage selection so the comparison is raw-vs-raw and modifiers apply to the final kept total.


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
