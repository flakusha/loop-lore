<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Items

**Overview:** (see sections below)


**Status:** In Progress

**Status Note:** Item routes ship (`src/routes/story-items/` definitions/handlers/instances, `src/routes/actor-items.ts`) with crafting and loot subsystems under `src/rpg/`; no consolidated item-type system and all acceptance criteria are unchecked. Remaining work is tracked in `epic-item-systems-unification.md`.
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** items, objects, world-items, interactable, loot

## Overview

Items specification — covers item types, properties, interactions, loot tables, and item lifecycle. Supersedes item sections in `docs/spec/actors.md`.

## Reference

- Spec: `docs/spec/items.md`
- Related: `docs/spec/actors.md`, `docs/spec/inventory.md`

## Implementation

> **Active development tracked in:** [`epic-item-systems-unification.md`](./epic-item-systems-unification.md) — consolidates item types, links NPC inventory, wires crafting, implements trade, and closes loot/persistence gaps.

## Item Systems

### Core Item Model

Items are split across three tables by lifetime, not by one polymorphic type:

- `items` — world-scoped definitions (category, rarity, stats, visibility).
- `world_items` — placed instances of a definition, owned by a location or an
  actor, carrying quantity and durability.
- `actor_items` — per-actor instances with an `equipped` flag.

Definitions, instances, and their lifecycle are owned by `ItemsService` in
`src/story/items/` (`definitions.ts`, `instances.ts`, `placement.ts`).
Loot generation lives in `src/rpg/loot/`, crafting in `src/rpg/crafting/recipes/`.

### Current State

| Capability                     | Status                     | Where |
| ------------------------------ | -------------------------- | ----- |
| Single item taxonomy           | Shipped                    | `src/db/enums-story/items.ts` (`TASK-unify-item-types`, Done) |
| Definition + instance CRUD     | Shipped                    | `src/routes/story-items/` |
| Loot persists as instances     | Shipped                    | `src/rpg/loot/` (`TASK-persist-loot-drops`, Done) |
| Effects parsing                | Shipped (3 kinds)          | `src/story/items/effects.ts` (`stat_delta`, `on_use`, `passive`) |
| Destroy lifecycle              | Shipped                    | `src/story/items/instances.ts` (`destroy`) |
| Richer effects (conditional, set, enchantment) | Not Started | `epic-item-system-extensions.md` |
| Durability degradation model   | Partial                    | `src/battle/items-integration.ts` |
| Loot tables                    | Not persisted              | `src/rpg/loot/` returns anonymous drops |

## Acceptance Criteria

- [x] Item type system implemented — one `ItemCategory`/`ItemRarity` taxonomy
  across definitions, instances, and actor items (`TASK-unify-item-types`, Done)
- [x] Item lifecycle (create, use, destroy) operational — `src/story/items/`
- [x] Loot generation persists items as `world_items` instances
  (`TASK-persist-loot-drops`, Done)
- [ ] Item properties and interactions beyond `stat_delta` / `on_use` /
  `passive` — conditional, set-bonus, and enchantment effects are unspecified in
  code (`epic-item-system-extensions.md`)
- [ ] Durable loot tables — `generateLoot()` returns drops without a table
- [ ] Unique-item provenance tracking beyond per-world duplicate rejection

## Related Epics

- `epic-item-systems-unification.md` — active owner of the remaining backend work
- `epic-item-system-extensions.md` — durability, effects, drift, dupe protection
- `epic-inventory.md` — actor-side inventory model
- `epic-inventory-ui.md` — item display, trading, equipment UI
- `epic-crafting-professions.md` — crafting recipes and stations
- `epic-economy-trading.md` — item value and trading

## Dependencies

- `src/story/items/` — `ItemsService`, the canonical item lifecycle
- `src/rpg/crafting/recipes/` — `RecipesService` (recipe CRUD shipped, stations
  and attempt execution deferred — `TASK-complete-crafting-system-services`)

## Unticketed Gaps

- Durable loot tables (`epic-inventory-system.md` records the same gap as
  "loot not persisted"; the table layer itself has no ticket)

## Linked Tasks

- `TASK-unify-item-types.md` (Done)
- `TASK-persist-loot-drops.md` (Done)
- `TASK-item-generation.md`
- `TASK-assistant-creative-studio-workflow-item.md`

## Generation via Creative Studio Workflows

Item creation through the assistant is specified as a **config-driven workflow template**
in `epic-assistant-creative-studio-workflows.md` §7.6. The `item-generation` workflow
(`TASK-assistant-creative-studio-workflow-item.md`) wraps the LLM item endpoint
(`POST /api/worlds/:worldId/items/generate-llm`, from `TASK-item-generation.md`) with
step building, `entity_type_presets.item` validation, and schema/balance/duplicate
quality gates. This is the canonical "Creative Studio's item workflow" referenced by
`TASK-item-generation.md`.
