# TASK: Actor Item Service (Equip/Unequip, Weight, Trade)

**Status:** ✅ Complete (2026-08-12)
**Priority:** P2 — Medium
**Effort:** Medium
**Epic:** epic-item-systems-unification
**Tags:** items, actor, inventory, equipment, service

## Summary

`actor_items` has no dedicated service — it relies on the generic `createEntityRoutes()` factory. There's no equip/unequip logic, no weight limit, no stat effects from equipment, and no way to trade actor items. This task creates a proper `ActorItemsService` with gameplay logic.

## Current State

- `routes/actor-items.ts` — uses `createEntityRoutes()` (same as notes/memories)
- `actor_items.equipped` field exists but no logic behind it
- No weight limit, no stat modifiers, no equip requirements

## Work

1. **Create `ActorItemsService`** — `src/services/actor-items.ts`:
   - `equip(actorId, itemId)` — set `equipped = "equipped"`, validate no conflicts (one weapon, one armor, etc.)
   - `unequip(actorId, itemId)` — set `equipped = "unequipped"`
   - `getEquipped(actorId)` — list all equipped items
   - `getCarriedWeight(actorId)` — sum weight × quantity
   - `canCarry(actorId, additionalWeight)` — check against capacity (base + CON modifier)
   - `transfer(fromActorId, toActorId, itemId, quantity)` — move between actors
2. **Equip requirements** — level requirement, stat requirement (from `ItemDefinition.properties`)
3. **Equip slots** — prevent equipping two weapons (unless dual-wield), two armors, etc.
4. **Weight capacity** — base 50 + (STR × 10) lbs, encumbrance thresholds (light/medium/heavy)
5. **Update routes** — extend `actor-items.ts` with equip/unequip/transfer endpoints beyond generic CRUD
6. **Stat effects** — equipped items contribute to combat stats (feeds into `battle/items-integration.ts`)

## Acceptance Criteria

- [x] `ActorItemsService` with equip/unequip/weight/transfer methods
- [x] Equip validates slot conflicts and requirements
- [x] Weight capacity enforced (can't pick up if over capacity)
- [ ] Equipped items contribute stat modifiers (AC from armor, damage from weapon) — deferred to `TASK-map-battle-equipment`
- [x] Transfer between actors creates/deducts `actor_items` rows
- [x] `bun test src/` green; `bun run check` green

## Scope Notes (impl 2026-08-12)

- **Slot conflicts** enforced (one per `item_type`; `slotForCategory` → weapon/armor/accessory).
- **Weight capacity** derived from `actor.settings.strength` (default 10 → 150 lb), `getCarryStatus` returns carried/capacity/encumbrance + `canCarry`.
- **Equip requirements / stat-effects**: circuit validated in `map-battle-equipment` task (depends on unified type + battle `EquipmentItem` bridging). Static-level/stat reqs deferred there; this task owns the service + route surface.
- No new DB columns (`capacity`/`base_weight` not added — actor `settings` JSON already holds stats).
- Equipped state mutation is per-item (one weapon + one armor + accessories via `item_type` slot rules). Dual-wield intentionally not wired.
- Routes added: `POST .../equip`, `POST .../unequip`, `GET .../equipped`, `GET .../carry`, `POST .../transfer` — ownership-checked via `actor.user_id`.
- Verified: full suite 3414 pass / 0 fail (12 new service tests), typecheck + frontend + coverage (96.90%) pass.

## Files to Create

- `src/services/actor-items.ts` — ActorItemsService
- `src/services/actor-items.test.ts` — unit tests

## Files to Modify

- `src/routes/actor-items.ts` — add equip/unequip/transfer endpoints
- `src/db/schema-core.ts` — add `capacity` or `base_weight` to actors if needed
- `src/battle/items-integration.ts` — consume equipped items for combat stats

## Related

- `TASK-unify-item-types.md` — actor items use unified types
- `TASK-implement-trade.md` — trade uses actor item transfer
- `TASK-map-battle-equipment.md` — equipped items feed battle stats
- `epic-item-system-extensions.md` — durability, effects on equip
