<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Item Generation (Procedural & LLM-Assisted)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
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
5. **Workflow-stack convergence (integration requirement)** — the LLM-assisted path routes through the entity-generation workflow stack rather than a parallel UX:
   - `POST /api/worlds/:worldId/items/generate-llm` becomes the dispatch target of the item workflow template (`TASK-assistant-creative-studio-workflow-item.md`): intent detection (`intent.target = "item"` already exists in `src/regex/intent.ts`), step preview, `entity_type_presets.item` validation, schema/consistency/duplicate/balance gates, confirmation.
   - The procedural path (template tables + randomization) stays a direct API — deterministic, no LLM — but keeps preview-before-create and feeds the same validation/taxonomy.
   - Manual creation (form) and generated items share validation, unified taxonomy, review surface, and provisioning (unallocated pool).
   - Story-introduced items reuse the unified in-place mechanism (`FEAT-in-story-character-generation-via-assistant-chat-handoff.md`) instead of a bespoke flow.
   - Common world item pool: batch-generated definitions land as world-scoped, unallocated definitions; manual and generated items are indistinguishable downstream.

## Acceptance Criteria

- [ ] Procedural generation endpoint creates items from templates + randomization
- [ ] LLM generation endpoint creates items from natural language descriptions
- [ ] Generation UI in world-edit items tab with preview-before-create
- [ ] Batch generation (multiple items in one request)
- [ ] Generated items respect world's item type taxonomy (unified enums)
- [ ] Generated items appear in provisioning dashboard as unallocated
- [ ] LLM generation dispatches via the item workflow template with confirmation + quality gates (no parallel generation UX)
- [ ] Manual creation and generated items share validation + taxonomy + provisioning flow
- [ ] Story-introduced items reuse the unified in-place mechanism
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
- `TASK-assistant-creative-studio-workflow-item.md` (workflow wrapper over the LLM endpoint)
- `FEAT-in-story-character-generation-via-assistant-chat-handoff.md` (in-place path)
