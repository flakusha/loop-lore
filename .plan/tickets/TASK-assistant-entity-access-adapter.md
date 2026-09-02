<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Entity Access Adapter Layer

**Status:** 📝 Not Started
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** assistant, adapter, composition, integration
**Related:** `epic-assistant-entity-access.md`, `src/assistant/commands/registry.ts`

## Summary

Implement the `EntityAdapter` layer that composes the assistant commands with existing entity services. The adapter translates command-level operations into calls to existing CRUD services (`insertGeneratedEntity`, `ItemsService`, world/location routes), ensuring the command handlers are thin and the business logic stays in the existing service layer.

## Motivation

Assistant command handlers should be thin — parsing user input, applying quality gates, and requesting confirmation. The actual entity manipulation logic lives in existing services (`src/routes/worlds/worlds.ts`, `src/story/items/`, etc.). The adapter layer bridges the gap between the assistant command model and the existing service layer.

## Design

### Adapter Pattern

Each entity kind has an adapter that implements `EntityAccessor` and delegates to the existing service layer:

```ts
// src/assistant/adapter/entity.ts

export interface EntityAdapter {
  kind: EntityKind;
  list(filter: EntityFilter): Promise<EntityRef[]>;
  get(id: string): Promise<Entity | null>;
  update(id: string, patch: Partial<Entity>): Promise<Entity>;
  delete(id: string): Promise<void>;
  duplicate(sourceId: string, overrides: Partial<Entity>): Promise<DuplicateResult>;
  adapt(sourceId: string, targetWorldId: string, fields: string[]): Promise<AdaptationResult>;
}
```

### Per-Kind Adapters

| Adapter | Delegates To |
|---|---|
| `WorldAdapter` | `src/routes/worlds/worlds.ts` (handleGetWorld, handleUpdateWorld, handleDeleteWorld) |
| `LocationAdapter` | `src/routes/worlds/locations.ts` (handleGetLocation, handleUpdateLocation) |
| `CharacterAdapter` | `src/routes/actors/` (character CRUD) |
| `ItemAdapter` | `src/story/items/` (ItemsService) + `src/routes/story-items/handlers.ts` |
| `RagAdapter` | `src/rag/` (FTS5 search, document retrieval) |
| `AssetAdapter` | `src/assets/` (asset service, signed URLs) |

### Access Guard Composition

The adapter wraps existing access guards:

```ts
async function getWithAccessCheck(
  adapter: EntityAdapter,
  id: string,
  userId: string,
): Promise<Entity | null> {
  const entity = await adapter.get(id);
  if (!entity) return null;
  if (!await checkAccess(entity, userId)) {
    throw new AccessDeniedError(`Cannot access ${entity.kind} ${id}`);
  }
  return entity;
}
```

### Quality Gate Composition

The adapter composes with the existing quality-gating pipeline:

```ts
async function modifyWithQuality(
  adapter: EntityAdapter,
  id: string,
  patch: Partial<Entity>,
  db: Kysely<DB>,
): Promise<QualityReport> {
  // 1. Load existing entity
  const entity = await adapter.get(id);
  // 2. Generate LLM-assisted modifications
  // 3. Apply quality gates from src/assistant/quality/entity-creation.ts
  // 4. Return QualityReport
}
```

### Command Handler Contract

Command handlers are thin — they delegate to the adapter:

```ts
// src/assistant/commands/worlds.ts (example)

export const worldGetHandler: CommandHandler = async (args, ctx) => {
  const worldId = args[0];
  if (!worldId) {
    return { systemMessage: "Usage: /world-get <world-id>", handled: true };
  }
  const world = await worldAdapter.get(worldId, ctx.userId);
  if (!world) {
    return { systemMessage: `World ${worldId} not found or access denied.`, handled: true };
  }
  return { action: "showWorld", actionPayload: world, handled: false };
};
```

## Tasks

- [ ] Implement `EntityAdapter` interface
- [ ] Implement `WorldAdapter` — compose with `src/routes/worlds/worlds.ts`
- [ ] Implement `LocationAdapter` — compose with `src/routes/worlds/locations.ts`
- [ ] Implement `CharacterAdapter` — compose with character CRUD
- [ ] Implement `ItemAdapter` — compose with `ItemsService`
- [ ] Implement `RagAdapter` — compose with FTS5/rag service
- [ ] Implement `AssetAdapter` — compose with asset service
- [ ] Implement access guard composition helpers
- [ ] Implement quality gate composition
- [ ] Unit tests for all adapters

## Acceptance Criteria

- [ ] `EntityAdapter` interface covers all entity kinds
- [ ] Each adapter delegates to existing service layer (no reimplementation)
- [ ] Access guard composition reuses existing guards
- [ ] Quality gate composition reuses `src/assistant/quality/entity-creation.ts`
- [ ] Command handlers are thin (delegate to adapters)
- [ ] Unit tests pass

## Files

- `src/assistant/adapter/entity.ts` — EntityAdapter interface
- `src/assistant/adapter/worlds.ts` — WorldAdapter
- `src/assistant/adapter/locations.ts` — LocationAdapter
- `src/assistant/adapter/characters.ts` — CharacterAdapter
- `src/assistant/adapter/items.ts` — ItemAdapter
- `src/assistant/adapter/rag.ts` — RagAdapter
- `src/assistant/adapter/assets.ts` — AssetAdapter
- `src/assistant/adapter/access.ts` — Access guard composition
- `src/assistant/adapter/quality.ts` — Quality gate composition

## Dependencies

- `src/routes/worlds/worlds.ts` — World CRUD
- `src/routes/worlds/locations.ts` — Location CRUD
- `src/routes/story-items/handlers.ts` — Item CRUD, ItemsService
- `src/assistant/quality/entity-creation.ts` — Quality gates
- `src/assistant/commands/registry.ts` — Command registry
