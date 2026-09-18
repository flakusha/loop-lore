<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-055: Duplicate Item Protection

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Dedupe ItemDefinition templates by (worldId, name, category).
**Context:** Distinct from TASK-054 (instance uniqueness vs template uniqueness).
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Labels**: items, rpg, duplicate, protection
**Epic**: epic-items
**Assignee**:

## Summary

Prevents the same `ItemDefinition` (template) from being silently duplicated when re-imported or generated twice. Adds a dedupe check on `ItemDefinition` creation keyed by `(worldId, name, category)` plus an optional content-hash field for collision detection on the LLM-generated path. Distinct from TASK-054 (unique **instance** tracking): this ticket stops duplicate **templates**.

## Context

- Definition creation: `ItemsService.createDefinition` (`src/story/items/definitions.ts`) inserts into the `items` table — no current dedupe.
- LLM generation: `src/generation/tools/create-item.ts` (referenced by `src/plugins/loader.ts`) creates definitions from prompts; duplicate prompts currently produce parallel rows.
- Stackable dispatch: `src/story/items/definitions.ts` writes `stackable`/`max_stack`; dupes may collide here.
- World scoping: `world_id` (`src/db/schema-story.ts`) is the natural dedupe boundary per TASK-050.
- Upstream: depends on `ItemCategory` enum (`src/db/enums-story/items.ts`) and the LLM tool loader wiring.

## Acceptance Criteria

- `ItemsService.createDefinition` rejects inserts when `(worldId, name, category)` already exists, returning a typed `DuplicateItemDefinitionError` carrying the existing `id`.
- LLM item tool (`src/generation/tools/create-item.ts`) catches `DuplicateItemDefinitionError` and surfaces "this item already exists" back to the assistant instead of inserting a second row.
- When two definitions legitimately share a name (different world or category), the gate still allows the insert.
- Optional `content_hash` column on `items` lets the LLM path reject near-duplicates with identical descriptions/shortcodes even if names differ.
- Idempotent re-import: re-running an item import script does not increase the row count for matching `(worldId, name, category)` tuples.

## Related Files

- `src/story/items/definitions.ts` *(existing)* — `createDefinition` dedupe.
- `src/generation/tools/create-item.ts` *(existing)* — LLM tool path.
- `src/db/schema.ts` *(speculative)* — optional `content_hash` migration.
- `src/rpg/loot/persist.ts` *(existing)* — anonymous drops may hit dedupe (consider returning existing id).

## Notes

- Speculative migration is marked; verify column names with current `src/db/schema.ts`.
- "Re-roll" semantics: when the assistant wants to overwrite an existing definition, expose an explicit `forceReplace: true` flag rather than a silent upsert.
- Conflict resolution when one user submits an LLM item that another user already created: default to "first wins"; revisit if UX demands merge.
