<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NPC navigation routes entirely stubbed — no service calls

**Status:** not-a-bug
**Priority:** high
**Priority Tier:** P2
**Effort:** Large
**Area:** npcs
**Source:** reconcile review (Scout Batch C — NPC-1)
**Resolved:** 2026-08-21

## Resolution

All 5 route handlers already contain real service calls. The ticket described code
from an older revision. Current implementation in `src/routes/rpg/npc-navigation.ts`:

| Endpoint | Handler | Service call |
|---|---|---|
| `GET /actors/:actorId/state` | Lines 39-60 | `svc().getMovementState(...)` ✓ |
| `PUT /actors/:actorId/state` | Lines 62-82 | `svc().updateMovementState(...)` ✓ |
| `POST /actors/:actorId/pattern` | Lines 84-113 | `svc().setMovementPattern(...)` ✓ |
| `POST /actors/:actorId/move` | Lines 115-135 | `svc().moveToLocation(...)` ✓ |
| `POST /worlds/:worldId/tick` | Lines 137-158 | `svc().processMovementTick(...)` ✓ |

Auth guards (`requireActorAccess`, `requireWorldOwner`) are also correctly wired.
No fix required.
