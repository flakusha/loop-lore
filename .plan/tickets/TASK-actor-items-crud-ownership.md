<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: actor_items CRUD + Ownership + Transfer

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** inventory, actor_items, ownership, transfer, crud
**Epic:** epic-inventory-system

## Summary

Own the `actor_items` instance layer: typed CRUD over `actor_items`
(per-actor inventory) with the `requireActorOwnership` guard on CRUD ops
(`src/actors/actor-items.ts`), plus the actor-to-actor ownership-transfer
primitive (enforced at the route via `actorOwnerCheck`, `src/routes/actor-items/service.ts`)
that trading settles through.

## Context

`actor_items` homes at HEAD (grep-verified): service `src/actors/actor-items.ts`
(CRUD + `requireActorOwnership` per op), ownership guard
`src/actors/access.ts` (`requireActorOwnership`), generic routes
`src/routes/actor-items.ts` (`tableName: "actor_items"`), actor-to-actor
transfer `transferItems` (`src/services/actor-items/transfer.ts`), world-side
transfer `transfer` (`src/story/items/instances.ts`) + route
`src/routes/story-items/instances.ts:114`, equip/weight/trade gameplay
`TASK-actor-item-service.md` (done). This ticket owns CRUD + ownership +
transfer; equip/weight/stat-effects stay in `TASK-actor-item-service.md`,
trade lifecycle in `TASK-implement-trade.md`, child-table lifecycle hooks in
`TASK-actors-child-tables-crud.md`, HTTP surface in `TASK-actors-api-routes.md`.

## Acceptance Criteria

- [ ] CRUD: create/read/update/delete + actor-scoped list/filter over `actor_items` via `src/actors/actor-items.ts`; `name` required on create
- [ ] Ownership: CRUD ops call `requireActorOwnership` (`src/actors/actor-items.ts` via `src/actors/access.ts`, keyed on `actors.owner_id` with `admin.character` bypass); transfer is enforced at the route via `actorOwnerCheck` (`src/routes/actor-items/service.ts:46-68`, keyed on `actors.user_id` with no admin bypass — reconcile to `owner_id` + bypass when touching this path); non-owner writes get 403, missing rows 404
- [ ] Transfer: actor-to-actor `transferItems` (`src/services/actor-items/transfer.ts`) moves quantity atomically in a single transaction with no orphans. Retry-safe within the single transaction only — NOT idempotent across re-runs (no idempotency key; a re-run double-moves). Add an idempotency key if re-run safety is required.
- [ ] Boundary: world-instance `transfer` (`src/story/items/instances.ts`) reused, not duplicated; trade offer/accept settles through these primitives
- [ ] Tests: unit coverage for CRUD guards + transfer atomicity; existing `src/routes/actor-items/service.test.ts` + `src/story/world-state` seed tests stay green

## Related

- `epic-inventory-system.md` (hub)
- `TASK-actor-item-service.md` (equip/unequip/weight/slots — done)
- `TASK-implement-trade.md` (trade lifecycle — done)
- `TASK-trade-history-npc-counterparty.md` (history + NPC counterparty)
- `TASK-actors-child-tables-crud.md` (child-table lifecycle hooks)
- `TASK-actors-api-routes.md` (HTTP surface)
