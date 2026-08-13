# TASK: Item Config Templates (Idempotent Seeding from Config)

**Status:** ⬜ Not Started
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

- [ ] `ItemsConfig` with `enabled` + `templates[]` in config schema
- [ ] Item templates define: name, category, rarity, properties, value, weight
- [ ] Default item templates cover all major categories (weapon, armor, consumable, tool, treasure)
- [ ] Seeder creates item definitions idempotently on server start
- [ ] Items can be seeded globally (all worlds) or per-world
- [ ] User config templates merge with/override built-in defaults
- [ ] Seeded items use unified `ItemCategory` + `ItemRarity` enums
- [ ] `bun test src/` green; `bun run check` green

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
