<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Persistent trade offer/accept/cancel lifecycle with counter-offers (barter/swap)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Epic: epic-item-systems-unification (Remaining Points #4), epic-economy-trading, epic-inventory-ui. Backend has synchronous POST /trade/execute only (src/services/trade/core.ts tradeCore + trade_history + getTradeHistory). No persistent pending exchanges: no offer table, no accept/cancel routes, no counter-offer negotiation, no expiry. Work: trade_offers table (id, world_id, initiator_actor_id, counterparty_actor_id, initiator_items JSON, counterparty_items JSON, initiator_gold, counterparty_gold, status pending/accepted/rejected/cancelled/expired, timestamps; inline into parts/005_actor_data.ts); POST /trade/offer, POST /trade/offers/:id/accept (atomic via tradeCore), POST /trade/offers/:id/counter, POST /trade/offers/:id/cancel, GET /trade/offers (actor-scoped, paged); ownership-gated both sides; world_id-scoped item validation (cf. BUG-services-tradecore-validatelines). Frontend: secure trade window (offer/counter/confirm) per epic-inventory-ui Phase 4 + NPC variant (pairs with TASK-npc-inventory-frontend, TASK-trade-history-npc-counterparty). Acceptance: full offer->counter->accept flow transfers both sides atomically; insufficient funds rejected; expiry/cancel leaves no partial state; bun test src/ + bun run check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
