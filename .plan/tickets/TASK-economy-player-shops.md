# TASK: Player-Run Shops & Economic Events

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-economy-trading
**Tags:** economy, shops, player-run, market, events

## Description

Add player-run shops and economic event mechanics to the Economy & Trading epic — players can open and manage shops, set prices, and participate in economic events like market crashes or trade fairs. Extends the existing trading system from NPC-driven to player-driven economy.

## How It Extends Existing Work

Builds on the Economy & Trading epic's currency system, market dynamics, and trading mechanics. Adds player-run commerce and economic events on top of the existing NPC-driven economy.

## Acceptance Criteria

- [ ] Player shop creation (name, location, inventory, pricing)
- [ ] Shop management UI (add/remove items, set prices, manage staff)
- [ ] Shop browsing and search (by category, price range, rarity)
- [ ] Economic events (market crashes, trade fairs, resource shortages)
- [ ] Player reputation as a merchant (trust, quality, pricing fairness)
- [] `GET/POST/PUT/DELETE /api/shops` routes
- [ ] `GET /api/shops/:id/browse` — browse shop inventory
- [ ] `POST /api/shops/:id/trade` — execute a trade
- [ ] Frontend shop creation and management panel
- [ ] Frontend marketplace with search and filters
- [ ] Frontend economic event notifications

## Technical Notes

- Player shops stored with owner_id, location_id, and inventory JSON
- Economic events are world-scoped and affect all shops/markets in a region
- Shop reputation integrates with existing reputation system (Epic: Faction & Reputation)
- Trade execution uses existing transaction/ledger infrastructure
