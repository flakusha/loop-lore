<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Inventory

**Overview:** (see sections below)


**Status:** In Progress

**Status Note:** Per-actor item CRUD ships (`src/routes/actor-items.ts` + service, equipment state in `src/db/enums`); no dedicated `src/rpg/inventory/` subsystem and all acceptance criteria are unchecked. Remaining work is tracked in `epic-item-systems-unification.md`.
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** inventory, items, storage, management, equipment

## Overview

Inventory system specification — covers item storage, equipment slots, inventory management, and item interactions. Supersedes inventory sections in `docs/spec/actors.md`.

## Reference

- Spec: `docs/spec/inventory.md`
- Related: `docs/spec/actors.md`, `docs/spec/items.md`

## Implementation

> **Active development tracked in:** [`epic-item-systems-unification.md`](./epic-item-systems-unification.md) — unifies inventory systems, adds equip/trade/weight mechanics, and links NPC inventory to world items.

## Inventory Systems

### Core Inventory Model

The inventory surface is a set of persisted rows, not a single aggregate:

- `actor_items` — per-actor instances with an `equipped` flag, scoped by the
  unified `ItemCategory`/`ItemRarity` taxonomy (`src/db/migrations/001_init.ts`,
  `ck_actor_items_type` CHECK).
- `world_items` — world-placed instances owned by a location or an actor.
- `npc_states.inventory` — deprecated denormalized JSON, superseded by
  `world_items.owner_actor_id` (`TASK-link-npc-inventory`, Done).

### Current State

| Layer                         | Status                  | Where |
| ----------------------------- | ----------------------- | ----- |
| `actor_items` CRUD            | Shipped                 | `src/routes/actor-items.ts`, `src/routes/actor-items/service.ts` |
| Ownership guard               | Shipped                 | `src/actors/actor-items.ts` (`requireActorOwnership`) |
| Actor-to-actor transfer       | Shipped (atomic)        | `src/services/actor-items/transfer.ts` |
| World-instance transfer       | Shipped, **non-atomic** | `src/story/items/instances.ts` |
| Equip / weight limits         | Partial                 | `src/services/actor-items/equip.ts` |
| Dedicated inventory subsystem | Not Started             | — |
| Inventory management UI       | Not Started             | `epic-inventory-ui.md` |

## Acceptance Criteria

- [x] `actor_items` CRUD (create/read/update/delete + actor-scoped list) with a
  per-operation ownership guard — `src/routes/actor-items.ts`
- [x] Equipment state modelled on the instance row (`equipped` flag) —
  `src/db/enums-core/flags.ts`
- [x] Actor-to-actor transfer is atomic (deduct + grant in one transaction) —
  `src/services/actor-items/transfer.ts`
- [ ] World-instance transfer is atomic — deducts before granting with no
  transaction wrapper, so a failed grant destroys the items
- [ ] Dedicated `src/rpg/inventory/` subsystem consolidating the actor / world /
  NPC inventories
- [ ] Equipment slot system beyond the boolean `equipped` flag
- [ ] Inventory management UI — `epic-inventory-ui.md`

## Related Epics

- `epic-item-systems-unification.md` — active owner of the remaining backend work
- `epic-inventory-system.md` — hub epic for the full inventory stack
- `epic-items.md` — item definitions and lifecycle
- `epic-inventory-ui.md` — grid/list, equipment, and trading UI
- `epic-economy-trading.md` — currency and market context

## Dependencies

- `src/story/items/` — `ItemsService`, the canonical item lifecycle
- `TASK-unify-item-types` (Done) — single taxonomy prerequisite

## Unticketed Gaps

- World-instance transfer atomicity (see Acceptance Criteria). No ticket covers
  the world-side half of the transfer primitive.

## Linked Tasks

- `TASK-actor-items-crud-ownership.md`
- `TASK-actor-item-service.md`
- `TASK-implement-trade.md`
- `TASK-link-npc-inventory.md`
