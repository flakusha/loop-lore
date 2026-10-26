<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant World & Location Access Commands

**Summary:** (none captured)
**Context:** Landed on dev: `/world-list` + `/world-get` in `src/assistant/commands/worlds-access.ts` (78359f6c1), `/world-update` + `/world-delete` in `src/assistant/commands/worlds-mutate.ts` (eb7cbfae2), `/loc-list` + `/loc-get` in `src/assistant/commands/locations.ts` (78359f6c1), `/loc-update` in `src/assistant/commands/locations-update.ts` (dc5be1832) — all registered in `src/assistant/commands/index.ts`. Unit tests: `src/assistant/commands/{worlds-access,worlds-mutate,locations}.test.ts`; the five entity-command test files run 118 pass / 0 fail.
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** assistant, world, location, access, crud
**Epic:** epic-assistant-entity-access
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

- [x] Implement `worldListHandler` — Paginated world list
- [x] Implement `worldGetHandler` — World details with lore and locations
- [x] Implement `worldUpdateHandler` — Update world metadata with confirmation
- [x] Implement `worldDeleteHandler` — Delete world with cascade
- [x] Implement `locListHandler` — Locations in a world
- [x] Implement `locGetHandler` — Location details
- [x] Implement `locUpdateHandler` — Update location metadata
- [x] Register all commands in the assistant command registry
- [x] Unit tests for all handlers

## Acceptance Criteria

- [x] `/world-list` returns owned + public + joined worlds
- [x] `/world-get` returns world details + lore + locations
- [x] `/world-update` modifies metadata with confirmation
- [x] `/world-delete` cascades and requires owner confirmation
- [x] `/loc-list` returns locations in a world
- [x] `/loc-get` returns location details + connections
- [x] `/loc-update` modifies location metadata with confirmation
- [x] All commands use existing access guards
- [x] Unit tests pass

## Files

- `src/assistant/commands/worlds.ts` — World command handlers
- `src/assistant/commands/locations.ts` — Location command handlers
- `src/assistant/adapter/worlds.ts` — World adapter composing with `src/routes/worlds/`
- `src/assistant/adapter/locations.ts` — Location adapter composing with `src/routes/worlds/locations.ts`

## Dependencies

- `src/routes/worlds/worlds.ts` — World CRUD handlers
- `src/routes/worlds/access.ts` — `requireWorldAccess`, `requireWorldOwner`
- `src/routes/worlds/locations.ts` — Location CRUD handlers

**Resolved:** 2026-10-26 registry-driven close: git issue e5e4128 (registry tip: 7b5b2e3e9 Konstantin Fedotov Close issue)
