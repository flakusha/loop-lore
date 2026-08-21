<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NPC navigation routes entirely stubbed — no service calls

**Status:** Open
**Priority:** high
**Effort:** Large
**Area:** npcs
**Source:** reconcile review (Scout Batch C — NPC-1)

## Evidence

`src/routes/rpg/npc-navigation.ts:35-146` — all 5 route handlers (`get state`, `put state`, `post pattern`, `post move`, `post tick`) contain only auth checks + try/catch returning `jsonResponse({ ok: true })` or `notFoundResponse`. `NpcNavigationService` is imported but never instantiated; no method is called.

## Impact

NPC movement API is entirely non-functional. Frontend and game-master cannot manage NPC locations. The entire NPC navigation subsystem is a no-op.

## Fix

Implement all 5 handlers:

```ts
// GET /npc/:npcId/movement/state
const state = await NpcNavigationService.getMovementState(db, npcId);
return jsonResponse({ state });

// PUT /npc/:npcId/movement/state
const updated = await NpcNavigationService.updateMovementState(db, npcId, body);
return jsonResponse({ state: updated });

// POST /npc/:npcId/movement/pattern
await NpcNavigationService.setMovementPattern(db, npcId, body.pattern);
return jsonResponse({ ok: true });

// POST /npc/:npcId/move
await NpcNavigationService.moveNpc(db, npcId, body.direction);
return jsonResponse({ ok: true });

// POST /npc/:npcId/movement/tick
await NpcNavigationService.processMovementTick(db, npcId);
return jsonResponse({ ok: true });
```

Also wire `src/story/game-master/execute.ts` to call `processMovementTick` on the tick route, not directly.

## Verification

- Add `src/routes/rpg/npc-navigation.test.ts` covering all 5 endpoints.
- E2E: create NPC → move → assert new location in DB.

## Acceptance Criteria

- [ ] All 5 endpoints functional with real service calls
- [ ] Tests cover happy path + auth guard
- [ ] `bun run check` clean
