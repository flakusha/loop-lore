<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Entity Adaptation Command & Engine

**Status:** 📝 Not Started
**Priority:** High
**Effort:** High
**Type:** Task
**Tags:** assistant, adaptation, context, outfit, knowledge, background
**Related:** `epic-assistant-entity-access.md`, `epic-lore-knowledge.md`, `epic-character-npc-lore-access.md`

## Summary

Implement the `/adapt` assistant command and the adaptation engine that re-contextualizes entities for new worlds/settings. Enables introducing new outfit, knowledge, or background story for a character placed in a new world.

## Motivation

When a character moves to a new world, their appearance, knowledge, and background may need to change to fit the new setting. Rather than manually re-creating the character, adaptation generates context-aware modifications. Examples:
- **Outfit**: A medieval knight adapts to a cyberpunk world — armor becomes high-tech gear
- **Knowledge**: A scholar from one world brings knowledge relevant to the new world's lore
- **Background story**: A character's backstory is rewritten to explain their presence in the new world

## Design

### Command

| Command | Subcommands | Description |
|---|---|---|
| `/adapt <kind> <source-id> --to <target-world>` | `[--fields outfit,knowledge,background]` | Adapt entity to target world |

### Examples

```
/adapt character char-001 --to world-cyberpunk --fields outfit,knowledge
→ Generates a cyberpunk-adapted outfit and knowledge for char-001

/adapt item item-001 --to world-medieval --fields category,rarity
→ Adjusts item category and rarity to fit medieval economy

/adapt location loc-001 --to world-forest
→ Adapts location description to include forest-specific lore
```

### Adaptation Engine

```ts
// src/assistant/adapter/adapt.ts

export interface AdaptationRequest {
  sourceKind: EntityKind;
  sourceId: string;
  targetWorldId: string;
  adaptFields: string[];
}

export interface AdaptationResult {
  newId: string;
  changes: FieldChange[];
  explanation: string;
}

export interface FieldChange {
  field: string;
  oldValue: string | null;
  newValue: string;
  reason: string; // Why this field was changed for the target world
}
```

### Adaptation Flow

```
User: /adapt character char-001 --to world-cyberpunk --fields outfit,knowledge
→ 1. Load source character and target world lore/setting
→ 2. Load target world's description, lore, and style notes
→ 3. LLM generates context-aware modifications for specified fields
→ 4. Build AdaptationResult with per-field changes and reasons
→ 5. Quality gates: schema validation, consistency with target world
→ 6. User confirmation with preview of changes
→ 7. Persist as new entity (or update source if --force)
```

### Target World Context Loading

The adaptation engine loads the target world's:
- `worlds.description` and `worlds.lore`
- World lore entries (`world_lore_entries`)
- World style/setting notes (if any)
- Existing characters/items/locations (for consistency)

### Quality Gates

Adaptation reuses the quality-gating pipeline from `src/assistant/quality/entity-creation.ts` with additions:
- **Consistency with target world**: The adapted entity must be consistent with the target world's lore and setting
- **Field-specific validation**: Outfit fields must match the entity kind; knowledge fields must reference valid lore entries

### Confirmation

Adaptation requires user confirmation. The confirmation message shows:
- The source entity and target world
- Each field change with the reason
- A preview of the adapted entity

## Tasks

- [ ] Implement `adaptHandler` — Parse request, load target world context, generate modifications
- [ ] Implement `AdaptationEngine` — LLM-assisted context-aware modification
- [ ] Define `AdaptationRequest`/`AdaptationResult`/`FieldChange` interfaces
- [ ] Implement target world context loading (description, lore, style)
- [ ] Integrate quality gates (schema, consistency with target world)
- [ ] Implement confirmation flow with change preview
- [ ] Register command in assistant command registry
- [ ] Unit tests for the adaptation engine

## Acceptance Criteria

- [ ] `/adapt` generates context-aware modifications for specified fields
- [ ] Target world context is loaded (description, lore, style)
- [ ] Each field change includes a reason
- [ ] Quality gates validate consistency with target world
- [ ] User confirmation required with change preview
- [ ] Adaptation produces a new entity (or updates source with `--force`)
- [ ] Unit tests pass

## Files

- `src/assistant/commands/adapt.ts` — Adapt command handler
- `src/assistant/adapter/adapt.ts` — Adaptation engine
- `src/assistant/quality/adaptation.ts` — Adaptation-specific quality gates

## Dependencies

- `src/routes/worlds/worlds.ts` — World lore/description access
- `src/assistant/quality/entity-creation.ts` — Quality gates (reuse)
- `epic-lore-knowledge.md` — World lore entries
- `epic-character-npc-lore-access.md` — Character access profile (for knowledge adaptation)
