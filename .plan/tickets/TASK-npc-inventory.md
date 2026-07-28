# TASK: NPC Inventory and Trading

**Epic:** NPC/Actor System, Economy & Trading
**Priority:** Medium
**Effort:** High
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G14 (NPC/Actor ↔ Supporting System)

## Summary

NPC inventory management and trading system for NPC merchants and allies.

## Background

NPCs need inventories for items they carry, trade, or sell. Merchant NPCs need dynamic inventories that change based on faction, location, and world state.

## Implementation

### Core Components

1. Behavior state machine with defined states and transitions
2. Memory event recording and recall system
3. Inventory management with trading interface

## Acceptance Criteria

- [ ] NPCs have inventory with item slots
- [ ] Merchant NPCs have dynamic buying/selling inventories
- [ ] NPC inventory affects trade availability
- [ ] NPC inventory persists per world
- [ ] Player can trade with NPC inventories

