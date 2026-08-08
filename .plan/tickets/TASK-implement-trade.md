# TASK: Implement Trade System (Transfer + Currency)

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** Large
**Epic:** epic-item-systems-unification
**Tags:** trade, economy, currency, transfer, crafting-orders

## Summary

No trade system exists — `ItemsService.transfer()` moves items but has no currency exchange. The `crafting_orders` table has payment fields but no service or routes. This task implements player-to-player and NPC trading with gold/currency exchange.

## Current State

- `ItemsService.transfer(worldItemId, quantity, toLocationId?, toActorId?)` — moves items, no payment
- `crafting_orders` table — has `offered_payment`, `requester_actor_id`, `crafter_actor_id` — completely unused
- No currency/wallet system exists (gold is item metadata, not a balance)

## Work

1. **Currency model** — add `actor_currencies` table (actor_id, world_id, currency_type, balance) or add `gold` column to `npc_states` / `actors`
2. **Trade offer/accept flow**:
   - `POST /api/worlds/:worldId/trade/offer` — create trade offer (items + gold offered, items + gold requested)
   - `POST /api/worlds/:worldId/trade/:offerId/accept` — counterparty accepts (transfer items + gold both directions)
   - `POST /api/worlds/:worldId/trade/:offerId/cancel` — cancel offer
3. **Transfer with payment** — extend `ItemsService.transfer()` or add `trade()` method:
   - Atomic transaction: deduct payment from buyer, add to seller; transfer items
   - Validate both parties have sufficient funds/items
4. **Crafting orders as trade** — `crafting_orders` becomes a specialized trade:
   - Requester posts order (recipe + payment offered)
   - Crafter accepts (provides crafted item, receives payment)
   - Uses same underlying trade mechanism
5. **NPC trading** — NPCs can be trade counterparties (buy player items, sell from inventory)
6. **Ownership checks** — both parties must own the items/currency they trade

## Acceptance Criteria

- [ ] Actor currency balances tracked (gold per actor per world)
- [ ] Trade offer creates a pending exchange (items + gold ↔ items + gold)
- [ ] Trade acceptance atomically transfers both directions
- [ ] Insufficient funds/items rejected with clear error
- [ ] Crafting orders use the trade system for payment
- [ ] NPC trading works (sell to NPC, buy from NPC inventory)
- [ ] Trade history queryable (optional, via `crafting_orders` or new table)
- [ ] `bun test src/` green; `bun run check` green

## Files to Create

- `src/routes/trade.ts` — trade offer/accept/cancel routes
- `src/services/trade.ts` — TradeService (offer/accept/cancel logic)

## Files to Modify

- `src/story/items/index.ts` — add `trade()` method (or extend transfer)
- `src/db/migrations/parts/005_actor_data.ts` — add `actor_currencies` table (inline, reinit) or add `gold` column to `npc_states`/`actors`
- `src/routes/crafting/orders.ts` — delegate to TradeService for payment

## Related

- `TASK-wire-crafting-routes.md` — crafting orders use trade
- `TASK-link-npc-inventory.md` — NPC inventory needed for NPC trading
- `TASK-actor-item-service.md` — actor items need trade support
- `epic-economy-trading.md` — economy spec
