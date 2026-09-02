<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant World & Location Access Commands

**Status:** 📝 Not Started
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** assistant, world, location, access, crud
**Related:** `epic-assistant-entity-access.md`, `src/routes/worlds/worlds.ts`

## Summary

Implement assistant slash commands for world and location management: `/world-list`, `/world-get`, `/world-update`, `/world-delete`, `/loc-list`, `/loc-get`, `/loc-update`. Enables the user to read and modify worlds and locations through the assistant.

## Motivation

The assistant can generate new worlds and locations (`epic-assistant-gm-flows.md`) but cannot read or modify existing ones. Users need to inspect world lore, update world metadata, and manage locations through the assistant.

## Design

### Commands

| Command | Subcommands | Description |
|---|---|---|
| `/world-list` | — | Owned + public + joined worlds |
| `/world-get <world-id>` | — | World details + lore + location list |
| `/world-update <world-id> <updates>` | — | Modify world metadata |
| `/world-delete <world-id>` | — | Delete world with cascade confirmation |
| `/loc-list [world-id]` | — | Locations in a world |
| `/loc-get <loc-id>` | — | Location details + connections |
| `/loc-update <loc-id> <updates>` | — | Modify location metadata |

### Access Guards

Commands compose with existing access guards — **no new access layer**:
- `requireWorldAccess` / `requireWorldOwner` from `src/routes/worlds/access.ts`
- Location access validated against world ownership
- Delete requires `requireWorldOwner` and cascades (locations, npcs, world_items, world_lore_entries, quests, asset_links)

### Update Format

`/world-update <world-id> lore=New lore text here` — key=value pairs parsed from args. Supported fields: `name`, `description`, `lore`, `visibility`, `kind`, `difficulty_modifier`.

### Confirmation

Mutating commands (`/world-update`, `/world-delete`, `/loc-update`) require user confirmation before persisting.

## Tasks

- [ ] Implement `worldListHandler` — Paginated world list
- [ ] Implement `worldGetHandler` — World details with lore and locations
- [ ] Implement `worldUpdateHandler` — Update world metadata with confirmation
- [ ] Implement `worldDeleteHandler` — Delete world with cascade
- [ ] Implement `locListHandler` — Locations in a world
- [ ] Implement `locGetHandler` — Location details
- [ ] Implement `locUpdateHandler` — Update location metadata
- [ ] Register all commands in the assistant command registry
- [ ] Unit tests for all handlers

## Acceptance Criteria

- [ ] `/world-list` returns owned + public + joined worlds
- [ ] `/world-get` returns world details + lore + locations
- [ ] `/world-update` modifies metadata with confirmation
- [ ] `/world-delete` cascades and requires owner confirmation
- [ ] `/loc-list` returns locations in a world
- [ ] `/loc-get` returns location details + connections
- [ ] `/loc-update` modifies location metadata with confirmation
- [ ] All commands use existing access guards
- [ ] Unit tests pass

## Files

- `src/assistant/commands/worlds.ts` — World command handlers
- `src/assistant/commands/locations.ts` — Location command handlers
- `src/assistant/adapter/worlds.ts` — World adapter composing with `src/routes/worlds/`
- `src/assistant/adapter/locations.ts` — Location adapter composing with `src/routes/worlds/locations.ts`

## Dependencies

- `src/routes/worlds/worlds.ts` — World CRUD handlers
- `src/routes/worlds/access.ts` — `requireWorldAccess`, `requireWorldOwner`
- `src/routes/worlds/locations.ts` — Location CRUD handlers
