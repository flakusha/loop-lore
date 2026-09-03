<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: battle/equipment.ts loot POST handler has no auth guard

**Status:** open
**Priority:** critical
**Priority Tier:** P0
**Effort:** Small
**Area:** security, rpg/battle
**Source:** trust-boundary audit (`docs/audit/trust-boundary.md` finding #1, commit `e16e34bd`)

## Evidence

`src/routes/battle/equipment.ts:169-209` — `POST /api/battle/equipment/loot`
handler reads `ctx.body` directly (loot table, monster level, world id,
actor id, location id) and persists loot rows via `items.giveToNpc` /
`items.placeInLocation`. The handler **never** calls `requireUserId(ctx)`,
**never** checks world ownership, and **never** validates that the caller
owns the target `actorId` or `locationId`. Any unauthenticated caller can
mint `world_items` rows into any `worldId` / `actorId` / `locationId`.

## Fix

1. Add `const userId = requireUserId(ctx,); if (typeof userId !== "string") { return userId; }` near the top of the handler (around line 172).
2. Add a world-ownership check: look up `worlds.owner_id` for the requested `worldId` and reject with 403 if `owner_id !== userId`. Reuse `assertWorldOwner` from `src/routes/rpg/crafting-station-instances.ts` if it can be lifted to a shared helper.
3. For the `actorId` branch, verify the actor belongs to the caller via `resolveActorAccess(database, actorId, userId)` before calling `items.giveToNpc`.
4. For the `locationId` branch, verify the location belongs to a world owned by the caller.

## Acceptance Criteria

- [ ] Anonymous request to `/api/battle/equipment/loot` returns 401.
- [ ] Authenticated request targeting a world the caller does not own returns 403.
- [ ] Authenticated request targeting a `actorId` the caller does not own returns 403.
- [ ] Authenticated request targeting a `locationId` in a world the caller does not own returns 403.
- [ ] Tests cover all four rejection paths + the happy path.
- [ ] `bun test src/routes/battle/` passes.
- [ ] No regression in existing battle/equipment tests.

## Related

- `docs/audit/trust-boundary.md` finding #1 (line 76)
- `src/routes/rpg/crafting-station-instances.ts:38-50` — `assertWorldOwner` helper
- `src/middleware/scope-by-user.ts` — recently-added `requireActorFromSession` (refactor #1)

## Resolution

(filled in at fix time)
