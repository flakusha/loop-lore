<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: rpg loot: luckModifier inverts drop quality — positive luck produces worse drops

**Status:** ✅ Resolved (sign fixed: adjustedRoll = roll + luckModifier clamped to [1,100])
**Priority:** high
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ## Observed / ## Evidence)
**Acceptance Criteria:** (see ## Acceptance Criteria)

## Summary

## Observed

generateLoot subtracts luckModifier from the rolled value before computing the threshold (line 81: `adjustedRoll = Math.max(1, roll - luckModifier)`). Rarity weights are inversely proportional to rarity (common=50, rare=15, artifact=1), so a LOWER threshold selects a LOWER cumulative (more common) item. The first item whose cumulative crosses the threshold wins; lower threshold → common items win more often. Positive luckModifier therefore biases toward COMMON drops, the opposite of the named convention.

## Expected

Positive luckModifier should INCREASE the adjusted roll (and thus the threshold) so that higher-rarity items are more likely to win. Standard convention: +luck = better drops.

## Evidence

- src/rpg/loot/generation.ts:80-82 — `adjustedRoll = Math.max(1, roll - luckModifier)` followed by `threshold = (adjustedRoll / 100) * totalWeight`.
- src/rpg/loot/weights.ts:9-17 — RARITY_WEIGHTS confirm common items have higher weight than rare/artifact.
- reproduction: generateLoot(entries with [common(weight 50), rare(weight 15)], level=1, dropCount=1, luckModifier=20). roll=42 → adjustedRoll=22 → threshold=22/100*65≈14.3 → first entry cumulative=50 crosses threshold → common wins. With luckModifier=0, roll=42 → threshold=27.3 → still common. With luckModifier=-20 (negative luck), roll=42 → adjustedRoll=62 → threshold=40.3 → rare wins. Positive luck produces worse drops.

## Severity

high

## Fix direction

Change line 81 to `const adjustedRoll = Math.min(100, roll + luckModifier);` (or invert the sign). Verify no existing tests pin the current behaviour and update them. Confirm with the loot-engine design that positive luck = better rarity, and rename the parameter if the convention is actually 'drop chance vs. rarity curve' (in which case the implementation still needs review for which direction produces the user-expected outcome).


## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
