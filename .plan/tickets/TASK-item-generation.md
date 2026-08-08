# TASK: Item Generation (Procedural & LLM-Assisted)

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Medium
**Epic:** epic-item-systems-unification
**Tags:** items, generation, procedural, llm, creative-studio, frontend

## Summary

No task currently covers **item generation** — creating new items procedurally (from templates/rarity tables) or via LLM assistance (describe an item → get structured item data). This is needed for GMs who want to quickly populate worlds with items, and for Creative Studio's item workflow.

## Current State

- Items are created manually via form (name, description, category, rarity, value, weight)
- `rpg/loot/templates.ts` has hardcoded item templates but no generation endpoint
- `TASK-item-spec-parameters.md` describes item structure but not generation
- Creative Studio has `TASK-creative-studio-item-modal.md` for viewing/editing but not generating

## Work

1. **Procedural generation** — `POST /api/worlds/:worldId/items/generate`:
   - Input: category, rarity range, count, optional tags/theme
   - Uses weighted templates (from `rpg/loot/templates.ts`) + randomization
   - Generates name, description, stats, value, weight based on rarity curve
   - Creates item definitions in the world
2. **LLM-assisted generation** — `POST /api/worlds/:worldId/items/generate-llm`:
   - Input: natural language description ("a cursed sword that drinks souls")
   - Calls LLM to produce structured item data (name, description, stats, properties)
   - Validates response against `ItemDefinition` schema
   - Creates item definition
3. **Generation UI** — in world-edit items tab:
   - "Generate Item" button → modal with options (category, rarity, count, theme)
   - Preview generated items before confirming creation
   - LLM mode: text area for description → preview → confirm
4. **Batch generation** — generate N items at once (e.g., "populate a blacksmith shop")

## Acceptance Criteria

- [ ] Procedural generation endpoint creates items from templates + randomization
- [ ] LLM generation endpoint creates items from natural language descriptions
- [ ] Generation UI in world-edit items tab with preview-before-create
- [ ] Batch generation (multiple items in one request)
- [ ] Generated items respect world's item type taxonomy (unified enums)
- [ ] Generated items appear in provisioning dashboard as unallocated
- [ ] `bun test src/` green; `bun run check` green

## Files to Create

- `src/routes/story-items/generate.ts` — generation endpoints
- `src/services/item-generator.ts` — procedural + LLM generation logic
- `src/frontend/alpine/world-item-generate.ts` — generation UI mixin

## Files to Modify

- `src/views/world-edit.html` — add generate button + modal
- `src/rpg/loot/templates.ts` — extend with more templates for generation seeds

## Related

- `TASK-persist-loot-drops.md` — loot generation persists items (same pattern)
- `TASK-item-spec-parameters.md` — item structure reference
- `TASK-creative-studio-item-modal.md` — Creative Studio item modal
- `TASK-unify-item-types.md` — generated items use unified types
- `TASK-item-provisioning-dashboard.md` — generated items appear as unallocated
