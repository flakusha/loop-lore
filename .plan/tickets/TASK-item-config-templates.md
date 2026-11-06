<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Item Config Templates (Idempotent Seeding from Config)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Scope:** item config templates: idempotent seeding from config
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-skills-professions-config
**Tags:** items, config, templates, seeding, idempotent

## Summary

Character templates are seeded idempotently from config on server start, but **items have no equivalent**. Every world starts empty — GMs must manually create every item. This task creates an item template config section (like characters) and seeds items into worlds on server start, with merge/override support and idempotent loading.

## Current State

- `src/config/sections/characters/` — full template system (types, defaults, section, seeder)
- `src/characters/seed/templates.ts` — seeds characters on server start
- `src/server/start.ts:163-192` — seeding entry point
- **Items**: no config, no templates, no seeder — manual creation only

## Work

1. **Create item template config types** — `src/config/sections/items/types.ts`:

   ```typescript
   interface ItemTemplate {
     id?: string; // hard ID for deterministic seeding
     name: string;
     description?: string;
     category: ItemCategory; // unified taxonomy
     rarity?: ItemRarity; // default "common"
     stackable?: boolean;
     maxStack?: number;
     value?: number;
     weight?: number;
     properties?: Record<string, unknown>; // stats, effects, damage, ac, etc.
     tags?: string[];
     creator?: string;
   }
   interface ItemsConfig {
     enabled: boolean;
     templates: ItemTemplate[];
   }
   ```

2. **Create defaults** — `src/config/sections/items/defaults.ts`:
   - Starter items: Iron Sword, Health Potion, Leather Armor, Torch, Rope, Gold Ring
   - Each with full properties (damage, healing, AC, etc.)
   - Cover all categories: weapon, armor, consumable, tool, treasure
3. **Create section** — `src/config/sections/items/section.ts` (JSON schema for validation)
4. **Create seeder** — `src/items/seed/templates.ts`:
   - `seedItemTemplates(database, config, worldId?, ownerId?)`
   - Idempotent: skip by name + world (like character seeder)
   - Creates `items` table rows (item definitions)
   - Optionally places instances via `ItemsService.placeInLocation()` (if location specified)
5. **Wire into server start** — `src/server/start.ts`:
   - After character seeding, seed items
   - Support per-world item templates (items belong to worlds, not global)
   - Merge built-in defaults with user config (same pattern as characters)
6. **Config schema** — add `items` to top-level `Config` schema

## Acceptance Criteria

- [x] `ItemsConfig` with `enabled` + `templates[]` in config schema (landed: `ItemsSection` class in `packages/core/src/config/sections/items/section.ts`; `src/config/...` paths in this sketch are re-export shims — real code lives in `packages/core/src/config/`)
- [x] Item templates define: name, category, rarity, properties, value, weight (landed: `ItemTemplate` in `packages/core/src/config/sections/items/types.ts`)
- [x] Default item templates cover all major categories (weapon, armor, consumable, tool, treasure) (landed: 6 defaults in `defaults.ts` — Iron Sword, Leather Armor, Health Potion, Torch, Hempen Rope, Gold Ring)
- [x] Seeder creates item definitions idempotently on server start (landed: `src/items/seed/templates.ts`, skip-by-(world,name,category) reusing `createDefinition` duplicate check; asserted by `src/items/seed/seed.test.ts`)
- [x] Items can be seeded globally (all worlds) or per-world (landed: global seeding inserts into every `worlds` row; `template.world` matches world id or name; explicit `worldId` seeder arg restricts/overrides)
- [x] User config templates merge with/override built-in defaults (landed: `mergeItemTemplates` by name case-insensitive, wired in `src/server/init-background-services.ts` next to the characters seed job)
- [x] Seeded items use unified `ItemCategory` + `ItemRarity` enums (landed: meta enums mirror `src/db/enums-story/items.ts`)
- [x] `bun test src/` green; `bun run check` green (landed: targeted `bun test src/items/ packages/core/src/config/sections/items/` 17 pass / 0 fail; `bun run check:fast` 14/14 PASS)

## Deviations from the sketch (landed reality, 2026-11-04)

- Ticket's `src/server/start.ts:163-192` seeding entry point is stale: character seeding actually runs in `src/server/init-background-services.ts` (invoked by start.ts) — item seeding wired there as an `item-templates` init job.
- `src/config/schema/config.ts` + section files are shim/re-export structure: real section code in `packages/core/src/config/sections/items/`; registration touched at schema-class (defaults factory), json-schema (property + required), schema/config.ts, sections barrel, and `src/config/sections/items/` shims.
- Seeder signature is `seedItemTemplates(database, config, worldId?)` — the sketch's `ownerId?` param dropped: `items` rows are world-scoped with no owner column.
- `ItemsService.placeInLocation()` instance placement NOT implemented (definition seeding only); instance placement needs a location target the config section doesn't carry — left out rather than half-wired.
- `createDefinition` gained an optional `hardId` third param to honor `template.id` deterministically.

## Files to Create

- `src/config/sections/items/types.ts` — item template types
- `src/config/sections/items/defaults.ts` — default item templates
- `src/config/sections/items/section.ts` — JSON schema
- `src/config/sections/items/index.ts` — barrel export
- `src/items/seed/templates.ts` — item seeder
- `src/items/seed/index.ts` — barrel export

## Files to Modify

- `src/server/start.ts` — wire item seeding
- `src/config/schema/config.ts` — add `items` section
- `src/story/items/types.ts` — ensure `ItemDefinition` compatible with template

## Related

- `TASK-unify-item-types.md` — items use unified taxonomy
- `TASK-character-config-skills-professions.md` — parallel: skills in character templates
- `TASK-item-generation.md` — generated items follow same `ItemDefinition` shape
- `TASK-item-provisioning-dashboard.md` — seeded items appear as unallocated
- `TASK-persist-loot-drops.md` — loot creates items with same structure

**Resolved:** 2026-11-06 registry-driven close: git issue a71cfe0 (registry tip: 8d983247e Konstantin Fedotov Close issue)
