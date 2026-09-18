<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: battle dice: critical success/failure checks discarded die under advantage/disadvantage

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

## Observed

rollDice in battle/integration-schemas/dice.ts handles advantage by rolling twice, keeping the higher total, and appending the discarded roll's results to the results[] array. Line 114 then reads `naturalRoll = results[0]` for critical detection, but results[0] is the ORIGINAL roll (now potentially discarded) — not the kept die. A natural 20 in the kept roll is missed when the original roll was discarded.

## Expected

The criticalSuccess/criticalFailure flags should reflect the KEPT die (the one whose value the engine actually used for the total), not the first element of results[] which may be the discarded original.

## Evidence

- src/battle/integration-schemas/dice.ts:99-111 — advantage/disadvantage replacement paths mutate `total` but do not record which die was kept.
- src/battle/integration-schemas/dice.ts:114-116 — naturalRoll = results[0] blindly.
- reproduction: rollDice('d20', 1, [{type:'advantage', value:0}]) with first roll=15, advantage roll=20. total=20 (correct). results=[15, 20]. naturalRoll = results[0] = 15. criticalSuccess = false (WRONG: should be true because the kept die is 20).

## Severity

high

## Fix direction

Track the kept die's face value separately. Add a `keptDie` field to the rollSet return or set it as a local variable when the advantage/disadvantage branch updates `total`. Set `naturalRoll = keptDie` (or results[idxOfKept]) instead of results[0].


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
