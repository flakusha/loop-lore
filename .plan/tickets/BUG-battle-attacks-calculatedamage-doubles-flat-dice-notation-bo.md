<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: battle attacks: calculateDamage doubles flat dice-notation bonus on critical hits

**Status:** ✅ Resolved (batch 2)
**Priority:** high
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ## Observed / ## Evidence)
**Acceptance Criteria:** (see ## Acceptance Criteria)

## Summary

## Observed

calculateDamage parses 'NdS+B' notation, rolls dice, then adds the bonus into baseDamageValue at line 94 BEFORE the critical multiply at line 98. Crit path therefore computes (dice+bonus)*2, doubling the flat bonus too. Correct D&D-style behaviour: only the dice portion is doubled on a crit, the flat bonus is added once.

## Expected

Critical hit should double only the rolled dice. baseDamageValue = sum(rolls); if isCritical baseDamageValue *= 2; baseDamageValue += bonus.

## Evidence

- src/battle/resolution-integration/attacks.ts:90-94 — dice loop + `baseDamageValue += bonus`.
- src/battle/resolution-integration/attacks.ts:97-99 — `if (isCritical) baseDamageValue *= 2`.
- reproduction: calculateDamage('2d6+3', [], true). rolls=10 (e.g.). baseDamageValue = 10 + 3 = 13. Crit 13 *2 = 26. Correct value: 10*2 + 3 = 23. Bonus was incorrectly doubled.

## Severity

high

## Fix direction

Reorder: `let baseDamageValue = diceSum; if (isCritical) baseDamageValue *= 2; baseDamageValue += bonus;` — bonus is added AFTER the crit multiply so it is included once.


## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
