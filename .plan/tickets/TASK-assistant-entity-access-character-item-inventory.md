<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Character, Item & Inventory Access Commands

**Status:** 📝 Not Started
**Priority:** High
**Effort:** High
**Type:** Task
**Tags:** assistant, character, item, inventory, access
**Related:** `epic-assistant-entity-access.md`, `src/routes/story-items/handlers.ts`, `epic-character-npc-lore-access.md`

## Summary

Implement assistant slash commands for character, item, and inventory management: `/char-list`, `/char-get`, `/char-update`, `/char-adapt`, `/item-list`, `/item-get`, `/item-update`, `/inventory`, `/item-transfer`, `/item-drop`, `/item-pickup`. Enables the user to read, modify, and manage characters, items, and inventory through the assistant.

## Motivation

The assistant can generate new characters and items (`epic-assistant-gm-flows.md`) but cannot read or modify existing ones. Users need to inspect character cards, update character fields, manage item definitions, and handle inventory (carry/drop/transfer items) through the assistant.

## Design

### Character Commands

| Command | Subcommands | Description |
|---|---|---|
| `/char-list` | — | Characters owned by user |
| `/char-get <char-id>` | — | Character card + stats + lore |
| `/char-update <char-id> <updates>` | — | Modify character fields |
| `/char-adapt <char-id> <new-world>` | — | Adapt character to new world (see Adaptation) |

### Item Commands

| Command | Subcommands | Description |
|---|---|---|
| `/item-list [world-id]` | — | Item definitions in a world |
| `/item-get <item-id>` | — | Item definition + instances |
| `/item-update <item-id> <updates>` | — | Modify item definition |

### Inventory Commands

| Command | Subcommands | Description |
|---|---|---|
| `/inventory [char-id]` | — | Items carried by character |
| `/item-transfer <instance-id> <to>` | — | Transfer item instance to location/character |
| `/item-drop <instance-id>` | — | Drop item at current location |
| `/item-pickup <instance-id>` | — | Pick up item from current location |

### Access Guards

Commands compose with existing guards:
- Characters: `owner_id` match (from `src/db/schema.ts` actors table)
- Items: `world_id` ownership check (reuses `checkWorldOwnership` from `src/routes/story-items/handlers.ts`)
- Inventory: items linked to character via `world_items` with `actor_id`
- Transfer: item instance ownership + target validation

### Inventory Model

Inventory is tracked through `world_items` table with `actor_id` foreign key. A character's inventory = `world_items` where `actor_id = charId`. Drop = set `actor_id = null`; Pickup = set `actor_id = charId`; Transfer = update `actor_id` or `location_id`.

### Character Adaptation

`/char-adapt` delegates to the adaptation engine (`TASK-assistant-entity-access-adaptation`). The character is adapted to the target world: new outfit, knowledge, background story adjusted to the world's setting.

## Tasks

- [ ] Implement `charListHandler` — Character list for owner
- [ ] Implement `charGetHandler` — Character card with stats and lore
- [ ] Implement `charUpdateHandler` — Update character fields with confirmation
- [ ] Implement `charAdaptHandler` — Adapt character to new world
- [ ] Implement `itemListHandler` — Item definitions in a world
- [ ] Implement `itemGetHandler` — Item definition + instances
- [ ] Implement `itemUpdateHandler` — Update item definition
- [ ] Implement `inventoryHandler` — Character's carried items
- [ ] Implement `itemTransferHandler` — Transfer item instance
- [ ] Implement `itemDropHandler` — Drop item at current location
- [ ] Implement `itemPickupHandler` — Pickup item from current location
- [ ] Register all commands in the assistant command registry
- [ ] Unit tests for all handlers

## Acceptance Criteria

- [ ] `/char-list` returns owned characters
- [ ] `/char-get` returns character card + stats + lore
- [ ] `/char-update` modifies fields with confirmation
- [ ] `/char-adapt` delegates to adaptation engine
- [ ] `/item-list` returns item definitions in a world
- [ ] `/item-get` returns item definition + instances
- [ ] `/item-update` modifies definition with confirmation
- [ ] `/inventory` returns character's carried items
- [ ] `/item-transfer` moves item instance to target
- [ ] `/item-drop` drops item at current location
- [ ] `/item-pickup` picks up item from current location
- [ ] All commands use existing access guards
- [ ] Unit tests pass

## Files

- `src/assistant/commands/characters.ts` — Character command handlers
- `src/assistant/commands/items.ts` — Item and inventory command handlers
- `src/assistant/adapter/characters.ts` — Character adapter
- `src/assistant/adapter/items.ts` — Item adapter composing with `src/story/items/`

## Dependencies

- `src/routes/story-items/handlers.ts` — `checkWorldOwnership`, `ItemsService`
- `src/assistant/adapter/entity.ts` — EntityAdapter interface
- `epic-assistant-entity-access-adaptation` — Adaptation engine
