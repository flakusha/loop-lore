<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Entity Modification & Addition Commands

**Status:** 📝 Not Started
**Priority:** High
**Effort:** High
**Type:** Task
**Tags:** assistant, modification, addition, import, quality-gates
**Related:** `epic-assistant-entity-access.md`, `src/assistant/quality/entity-creation.ts`

## Summary

Implement assistant slash commands for modifying existing entities and adding new entities beyond generation: `/modify`, `/apply`, `/import`, `/add`, `/clone`. Modification uses the LLM to generate updates with quality gating; addition supports importing from files and adding to existing worlds.

## Motivation

The assistant can generate new entities (`/create`) but cannot modify existing ones or add entities via import. Users need to:
- **Modify** existing entities with LLM-assisted updates (quality-gated)
- **Apply** direct field-level patches without LLM involvement
- **Import** entities from files (PNG/YAML/TOML/JSON/CHARX)
- **Add** new entities to existing worlds
- **Clone** an entity to start a duplication workflow

## Design

### Modification Commands

| Command | Subcommands | Description |
|---|---|---|
| `/modify <kind> <id> <description>` | — | LLM-assisted modification with quality gates |
| `/apply <kind> <id> <patch>` | — | Direct field-level patch (no LLM) |

### Addition Commands

| Command | Subcommands | Description |
|---|---|---|
| `/import <kind> <file>` | — | Import entity from file (PNG/YAML/TOML/JSON/CHARX) |
| `/add <kind> <name>` | — | Add new entity to existing world |
| `/clone <kind> <source-id>` | — | Start a duplication workflow (see `/duplicate`) |

### Modification Flow


```

User: /modify character <id> "Make this character more mysterious"
→ Load existing entity
→ LLM generates modified fields (personality, description, background)
→ Quality gates: schema validation, consistency check, duplicate check
→ User confirmation
→ Persist modifications

```


### Apply Flow

Direct field-level patch — no LLM, no quality gates (just schema validation):

```

User: /apply character <id> personality="more secretive"
→ Validate patch fields
→ Apply directly

```


### Import Flow

Reuses existing import infrastructure (`char import: PNG/YAML/TOML/JSON/CHARX`). The assistant wraps the import as a command:

```

User: /import character my-character.yaml
→ Parse file → validate → confirm → persist

```


### Quality Gates

Modification commands reuse the quality-gating pipeline from `src/assistant/quality/entity-creation.ts`:
- Schema validation (hard reject)
- Duplicate check (warning)
- Consistency check against active world (warning)

### Confirmation

All mutation commands (`/modify`, `/apply`, `/import`, `/add`, `/clone`) require user confirmation before persisting.

## Tasks

- [ ] Implement `modifyHandler` — LLM-assisted modification with quality gates
- [ ] Implement `applyHandler` — Direct field-level patch
- [ ] Implement `importHandler` — Import entity from file
- [ ] Implement `addHandler` — Add new entity to existing world
- [ ] Implement `cloneHandler` — Start duplication workflow
- [ ] Register all commands in the assistant command registry
- [ ] Reuse quality-gating pipeline from `src/assistant/quality/entity-creation.ts`
- [ ] Unit tests for all handlers

## Acceptance Criteria

- [ ] `/modify` generates LLM-assisted updates with quality gates
- [ ] `/apply` applies direct field-level patches
- [ ] `/import` imports entities from supported file formats
- [ ] `/add` creates new entities in existing worlds
- [ ] `/clone` starts a duplication workflow
- [ ] All mutation commands require user confirmation
- [ ] Quality gates reuse existing `entity-creation.ts` pipeline
- [ ] Unit tests pass

## Files

- `src/assistant/commands/modify.ts` — Modify and apply handlers
- `src/assistant/commands/import.ts` — Import and add handlers
- `src/assistant/adapter/modify.ts` — Modification adapter composing with quality gates

## Dependencies

- `src/assistant/quality/entity-creation.ts` — Quality-gating pipeline (reuse)
- `src/assistant/adapter/entity.ts` — EntityAdapter interface
- `src/routes/story-items/handlers.ts` — Existing import logic (reference)
