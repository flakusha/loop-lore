<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: World Item Placement — Give to NPC / Actor

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Small
**Epic:** epic-inventory-ui
**Tags:** items, instances, npc, placement, frontend

## Summary

Extend the world item-instance placement UI (shipped in `TASK-WORLD-ITEM-FRONTEND`) to support **placing an item instance onto an NPC / actor**, not just at a location. The backend already accepts `ownerActorId` and `toActorId` on the instance endpoints.

## Backend (exists, verified)

| Route                                                           | Body                                               |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `POST /api/worlds/:worldId/item-instances`                      | `{ itemId, locationId?, ownerActorId?, quantity }` |
| `POST /api/worlds/:worldId/item-instances/:instanceId/transfer` | `{ quantity?, toLocationId?, toActorId? }`         |

The world-edit page loads locations into state but has **no actor/NPC list**, so the place form has no actor target. Need an actor source first.

## Work

1. **Actor source** — add a way to fetch a world's actors/NPCs on the world-edit page (e.g. `GET /api/actors?worldId=` or a world-scoped actors endpoint — verify which exists; `src/routes/actors*.ts`).
2. **Placement UI** — in the item Instances section, allow choosing a target: **location** (existing) OR **NPC/actor** (`ownerActorId`). Wire the actor `<select>` fed from the new actor list.
3. **Display** — show `owner_actor_id` (actor name via id resolution, like `locName`) on placed instances; only show location or actor as appropriate.
4. **Optional transfer** — expose the transfer endpoint in the UI if within scope.

## Acceptance Criteria

- [ ] Can create an item instance assigned to a specific NPC/actor (`ownerActorId` set)
- [ ] Placed-instance list shows the owning actor (resolved name) when present
- [ ] Actor list loads on the world-edit page without a page reload
- [ ] Unit tests for the actor-placement path
- [ ] `bun test src/frontend` green; frontend typecheck green

## Related

- `TASK-world-item-frontend.md` — base items UI (done: creation + settings + location placement)
- `src/routes/story-items.ts` — instance endpoints
- `TASK-actor-notes-items-lore-frontend.md` — actor-level item UI (separate)
