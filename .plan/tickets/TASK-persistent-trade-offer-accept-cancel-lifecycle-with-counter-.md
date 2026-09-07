<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Two-sided trade counter-offers + offer deadline enforcement + trade-window UI (barter/swap)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Epic: epic-item-systems-unification (Remaining Points #4 residual), epic-economy-trading, epic-inventory-ui. Verified 2026-09-07 against `src/services/trade/` + `src/routes/trade/`: one-sided offer lifecycle EXISTS (`offers.ts` — createOffer/acceptOffer/cancelOffer/listOffers on `crafting_orders` with `trade_type="trade"` sentinel; `routes/trade/offers.ts` exposes create/accept/cancel/list; `history.ts` + `npc.ts` routes exist wired to `services/trade`). True residual gaps: (1) offers are buyer-one-sided — buyer proposes items+gold, seller can only accept/cancel, seller-side items unmodeled; (2) no counter-offers — no route for seller to propose modified terms; (3) `deadline` stored on accept path but never enforced (no expiry sweep/mark-expired). Work: extend offer model with seller-side items + `countered` status transition (counter supersedes terms, resets acceptance, notifies counterparty); enforce deadlines (mark expired, reject accept on expired); ownership-gate + world_id-scope both sides (cf. BUG-services-tradecore-validatelines). Frontend: secure trade window (offer/counter/confirm) per epic-inventory-ui Phase 4 + NPC variant (pairs with TASK-npc-inventory-frontend, TASK-trading-interface.md). Acceptance: full offer->counter->accept transfers both sides atomically via tradeCore; expired offers reject accept; cancel/expiry leaves no partial state; bun test src/ + bun run check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
