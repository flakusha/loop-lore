<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: NpcNavigationService.processMovementTick has zero unit tests

**Status:** Open
**Priority:** medium
**Priority Tier:** P5
**Effort:** Medium
**Area:** npcs
**Source:** reconcile review (Scout Batch C — NPC-2)

## Evidence

`src/rpg/npc-navigation/service/processing.ts` — `processMovementTick` is called by `src/story/game-master/execute.ts:41` but has zero test coverage. No `*.test.ts` file exercises `NpcNavigationService`, `MovementPattern`, or `NpcMovementState`.

## Impact

Core NPC movement logic has no automated test coverage; regression in tick processing would go undetected.

## Fix

Add:

- `src/rpg/npc-navigation/service/processing.test.ts` — covers `processMovementTick` with mock DB
- `src/rpg/npc-navigation/service/index.test.ts` — covers `NpcNavigationService` CRUD methods

## Verification

- Run `bun test src/rpg/npc-navigation/`

## Acceptance Criteria

- [ ] `processMovementTick` tested with mock DB
- [ ] `setMovementPattern` tested with valid/invalid patterns
- [ ] `getMovementState` tested for missing NPC → 404
