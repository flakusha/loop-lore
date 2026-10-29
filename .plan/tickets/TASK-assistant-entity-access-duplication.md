<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Entity Duplication Command

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** assistant, duplication, clone, copy
**Epic:** epic-assistant-entity-access
**Related:** `epic-assistant-entity-access.md`, `src/assistant/adapter/duplicate.ts`
**Status Note:** Done (2026-10-29, branch `r2-entity-access-wrapup`, commits `526b3ed3b`, `f31622da9`). `/duplicate <kind> <source-id> [--with key=value …] [--as "Name"]` shipped in `src/assistant/commands/duplicate.ts`: the source loads through its adapter's ownership guard, `--with` applies field overrides (last-wins) and `--as` renames the copy, the copied fields travel in the `duplicate-entity` payload (`fields`) with the overridden subset tracked separately (`overriddenFields`), and the copy is created only after the user confirms — the confirm route re-validates the draft (`normalizeEntity` + `validateEntitySchema` + world ownership in `src/routes/messages/create-entity-confirm.ts`) and attributes the new row to the confirming caller, i.e. the original owner. DEVIATION: there is no `DuplicateResult` type — the copied/overridden tracking lives in the preview payload, and the advisory duplicate/consistency checks are not run for copies (the schema gate still rejects invalid drafts). Unit coverage `src/assistant/commands/duplicate.test.ts`. Test suites were not re-run in this wrap-up.

## Summary

Implement the `/duplicate` assistant command for duplicating entities with optional modifications. Creates a new entity by copying an existing one's properties, with optional field overrides.

## Motivation

Users often want to create variants of existing entities — a character with a different outfit, a location in a different world, an item with modified properties. Rather than creating from scratch, duplication copies the source and lets the user specify changes.

## Design

### Command

| Command | Subcommands | Description |
|---|---|---|
| `/duplicate <kind> <source-id>` | — | Create a copy of the source entity |
| `/duplicate <kind> <source-id> --with <changes>` | `[--as <new-name>]` | Copy with specified modifications |

### Examples

```
/duplicate character char-001 --with personality="more cautious" --as "Aria the Guard"
→ Creates new character copying char-001's stats, but overriding personality and name

/duplicate location loc-001 --as "Mirror Cave"
→ Creates a copy of loc-001 in the same world with a new name

/duplicate item item-001 --with rarity="legendary" --as "Excalibur"
→ Creates a copy of item-001 with upgraded rarity
```

### Duplication Logic

```ts
async function duplicateEntity(
  sourceKind: EntityKind,
  sourceId: string,
  overrides: Partial<Entity>,
): Promise<DuplicateResult> {
  // 1. Load source entity (with access guard)
  const source = await entityAccessor.get(sourceId);
  if (!source) return error("Entity not found");

  // 2. Determine accessible fields to copy
  const copiedFields = determineCopiableFields(source);

  // 3. Build new entity with overrides
  const newEntity = {
    ...source,
    ...overrides,
    name: overrides.name ?? `${source.name} (copy)`,
    ownerId: source.ownerId, // copies stay with original owner
  };

  // 4. Quality gates (schema, duplicate, consistency)
  const report = await runQualityGates(newEntity);

  // 5. User confirmation
  // 6. Persist via EntityAccessor

  return {
    newId: newEntity.id,
    name: newEntity.name,
    copiedFields,
    overriddenFields: Object.keys(overrides),
  };
}
```

### Field Copy Rules

| Kind | Copied Fields | Not Copied |
|---|---|---|
| Character | name, description, personality, scenario, traits | id, ownerId |
| Location | name, description, connections | id, world_id |
| World | name, description, lore | id, owner_id, difficulty |
| Item | name, description, category, rarity, properties, value, weight | id, world_id |

### Confirmation

Duplication requires user confirmation before persisting. The confirmation message shows:
- What was copied
- What was overridden
- The new entity preview

## Tasks

- [ ] Implement `duplicateHandler` — Load source, copy fields, apply overrides
- [ ] Define per-kind copiable field mapping
- [ ] Integrate quality gates
- [ ] Implement confirmation flow with preview
- [ ] Register command in assistant command registry
- [ ] Unit tests

## Acceptance Criteria

- [ ] `/duplicate` creates a copy of the source entity
- [ ] `/duplicate --with` applies specified field overrides
- [ ] Copied fields tracked in DuplicateResult
- [ ] Overridden fields tracked in DuplicateResult
- [ ] Quality gates apply to the new entity
- [ ] User confirmation required before persisting
- [ ] Duplicated entities stay with original owner
- [ ] Unit tests pass

## Files

- `src/assistant/commands/duplicate.ts` — Duplicate command handler
- `src/assistant/adapter/duplicate.ts` — Duplication logic

## Dependencies

- `src/assistant/adapter/entity.ts` — EntityAccessor interface
- `src/assistant/quality/entity-creation.ts` — Quality gates (reuse)

**Resolved:** 2026-10-29 registry-driven close: git issue d27f7df (registry tip: d5623ea3a Konstantin Fedotov Auto-closed: appended .md marker marks TASK-ASSISTANT-ENTITY-ACCESS-DUP)
