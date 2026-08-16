<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fix turn number double-count in TurnManager/executeTurn

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Small
**Epic:** epic-logic-reconciliation

## Summary

Turn numbers are off by one due to double-increment. `TurnManager.selectNextActor()` increments `currentTurn` before selecting, then `GameMasterService.executeTurn()` adds 1 again.

## Current Code

`src/turning/turn-manager.ts` line ~108:

```ts
this.state.currentTurn++;
```

`src/story/game-master.ts` line ~143:

```ts
const turnNumber = this.turnManager.currentTurn + 1;
```

## Result

- Turn 0: `selectNextActor()` sets `currentTurn = 1`, `executeTurn()` uses `1 + 1 = 2`
- First turn is numbered 2 instead of 1

## Fix

Remove the `+ 1` in `executeTurn()` — `selectNextActor()` already incremented the counter.

## Acceptance Criteria

- [ ] First turn number is 1 (not 2)
- [ ] Existing turn-manager tests still pass
- [ ] GameMasterService tests updated if needed
