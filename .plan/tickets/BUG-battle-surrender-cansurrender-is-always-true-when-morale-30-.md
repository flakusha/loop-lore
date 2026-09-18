<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: battle surrender: canSurrender is always true when morale ≤ 30, redundant with surrenderChance

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

## Observed

calculateSurrenderChance returns `canSurrender: true` unconditionally at line 40 whenever the function reaches that point (i.e., morale ≤ 30). The only way canSurrender is false is at line 20 (morale > 30, surrenderChance=0). So canSurrender is effectively a duplicate of `morale ≤ 30` — it does not gate anything new and provides no information beyond what the caller already has. A caller that already enforces morale ≤ 30 cannot rely on canSurrender for any other condition.

## Expected

canSurrender should reflect whether surrender is actually viable (chance > 0) OR the function should drop canSurrender and have callers use surrenderChance directly. The current field is misleading.

## Evidence

- src/battle/social-integration/surrender.ts:13-42 — canSurrender hard-coded true at line 40.
- reproduction: calculateSurrenderChance({value: 30, ...}, reputation=-100, healthPercent=100) → chance ≈ 0 (clamped), canSurrender = true. Surrender is 'available' but chance is 0; the field is useless.

## Severity

low

## Fix direction

Either remove canSurrender (and have callers consult surrenderChance > 0), or make canSurrender meaningful: `canSurrender: chance > 0` at line 40.


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
