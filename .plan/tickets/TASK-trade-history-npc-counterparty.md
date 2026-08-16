<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Trade History + NPC Counterparty

**Status:** open
**Priority:** medium
**Labels:** rpg, trade, economy, routes
**Assignee**:
**Epic:** epic-rpg-wiring-phase3.md
**Related:** TASK-implement-trade.md, TASK-npc-inventory-frontend.md

## Summary

Close the deferred points from `TASK-implement-trade.md` /
`epic-item-systems-unification.md` "Remaining Points" #4–6. The trade backend landed in
worktree `rpg-wire-routes` (2026-08-12): currency ledger + atomic two-sided trade service
(offer/accept lifecycle) with `TradeService` supporting any actor owner. Missing:
queryable trade history and a counterparty wrapper so NPCs (world actors) can trade.

## Current State

- ✅ `TradeService` — atomic two-sided transfer (offer/accept part shipped)
- ⬜ No trade history table/query — ledger entries not exposed read-only
- ⬜ No NPC counterparty wrapper — only player-initiated trades work

## Work

- Trade history: read-only `GET /api/trade/history` (actor-scoped; paged) over the
  currency ledger + transfer events; index on `(actor_id, created_at)`
- NPC counterparty: wrapper service resolving an NPC's stored inventory
  (`world_items.owner_actor_id`, from `TASK-link-npc-inventory.md`) as tradeable side;
  endpoint e.g. `POST /api/trade/npc/:worldActorId` gated on NPC interactability
- Symmetric validation: both sides balance-checked; quantity CHECK enforced; no
  double-spend (reuse atomic persist pattern from `TASK-implement-trade.md` review pass)

## Acceptance Criteria

- [ ] Trade history queryable per actor with pagination
- [ ] NPC trades execute against `world_items.owner_actor_id` inventory
- [ ] Both sides validated symmetrically; no partial transfers
- [ ] Ownership-gated (participant actors only)
- [ ] `bun test src/` green; `bun run check` green
- [ ] OpenAPI docs generated for new endpoints

## Files to Create

- `src/routes/trade/history.ts` — read API
- `src/routes/trade/npc.ts` — NPC counterparty
- `src/routes/trade/index.ts` — barrel export (wire into `elysia-app.ts`)
- Service additions in `src/rpg/trade/` (history query, NPC wrapper)

## Related

- `epic-item-systems-unification.md` — Remaining Points #4–6
- `epic-rpg-wiring-phase3.md` — parent epic
- `TASK-implement-trade.md` — landed ledger + two-sided service
- `TASK-npc-inventory-frontend.md` — NPC inventory UI (frontend counterpart)
