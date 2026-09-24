<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: criticalHit in makeAttackRoll ignores the kept die under advantage/disadvantage

**Status:** [OK] Open
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Files:** src/battle/resolution-integration/attacks.ts:36

## Issue

`makeAttackRoll` (attacks.ts:36) determines `criticalHit` using `roll.results[0]`:

```ts
const criticalHit = roll.criticalSuccess || (roll.results[0] ?? 0) >= criticalThreshold;
```

But `rollDice` (integration-schemas/dice.ts:93-108) applies advantage/disadvantage by appending the reroll to `results` and setting `keptIdx` to track which die was actually kept. The correct natural roll is `results[keptIdx]`, not `results[0]`.

Example: a d20 with **advantage** rolls a 1 (discard) and rerolls a 20 (kept). `keptIdx = 1`, `naturalRoll = 20`. The dice layer correctly sets `criticalSuccess = true`. But `makeAttackRoll` checks `results[0] = 1`, which is NOT the kept die — so `1 >= 20` is false, and `criticalHit = roll.criticalSuccess = true` IS used as part of the OR expression; however the secondary check `(results[0] ?? 0) >= criticalThreshold` is meaningless when `keptIdx != 0` because it inspects the discarded die. Under **disadvantage** the keptIdx also deviates from 0, but the throw (kept-die) is the lower number and the discarded die is the higher — so the bug manifests primarily on advantage cases where the discarded die is low (e.g. nat 1) but the kept die is high (e.g. nat 20).

## Why it matters

Combat narration is inverted when advantage/disadvantage changes which die is kept. The player is told they critically missed when they critically hit.

## Concrete fix

`attacks.ts:36`: replace `results[0]` with the kept die using `roll.keptIdx` (requires adding `keptIdx: number` to `DiceRoll` return type in `integration-schemas/dice.ts`):

```ts
const naturalRoll = roll.results[roll.keptIdx ?? 0] ?? 0;
const criticalHit = roll.criticalSuccess || naturalRoll >= criticalThreshold;
```

## Existing ticket check

No prior BUG ticket for this specific defect. Related: `BUG-battle-dice-advantage-disadvantage-rolls-ignore-modifiers-bi` (closed; modifier application, not kept-die lookup).

## Tests

```ts
it("criticalHit uses the kept die under advantage (rerolling 1 into 20)", () => {
  // Seed Math.random: roll 1, reroll 20. Advantage keeps higher = 20.
  // keptIdx=1, results[1]=20, results[0]=1.
  // attacks.ts:36 must consult results[keptIdx], not results[0].
  const attack = makeAttackRoll(0, 10, [{ type: "advantage" }]);
  expect(attack.criticalHit).toBe(true); // 20 was the kept die
  expect(attack.narration).toInclude("Critical hit!");
});
```


git issue: 9098dc3
