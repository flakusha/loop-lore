<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: battle resolution-integration missing empty-input adapter

**Status:** ✅ Resolved
**Priority:** low
**Effort:** Medium

## Summary

resolution-integration lacks default adapter for empty input; boundary tests use processCombatRound as workaround. Detected in worktree test-coverage-tiers commit 31383174aa6ab1f21ca5a741f7ba1acc763bfa41.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

No empty-input adapter was ever needed — the premise was wrong. The canonical boundary suite (test-coverage-tiers) imported `calculateAttackRoll`, `calculateDefenseRoll`, and `processCombatRound`, which don't exist on the real API: `src/battle/index.ts` exports `makeAttackRoll`, `makeSavingThrow`, `calculateDamage`, `rollDice` etc. from `resolution-integration`. The stub `processCombatRound` was the only "adapter", and it lived in `src/battle/resolution-adapters.ts` — deprecated dead code with zero importers (verified repo-wide).

Fix: rewrote `src/battle/resolution.boundary.test.ts` against real entry points with correct signatures (`rollDice("d20")`, `calculateDamage("2d6+3", [])` → `totalDamage`), and deleted `src/battle/resolution-adapters.ts`. Real resolution already accepts empty input — `makeAttackRoll(0, 10, [])` with empty modifiers, `makeSavingThrow` against a zero-value DC, empty `rollDice` modifiers. 15/15 battle tests pass (5 new boundary + 10 existing items-integration). Build typecheck shows one unrelated pre-existing error in `src/frontend/vn/choice-cards.ts` (untouched by this change).
