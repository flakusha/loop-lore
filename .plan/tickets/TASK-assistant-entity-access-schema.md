<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Entity Access Schema

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** assistant, entity, schema, access, adapter
**Epic:** epic-assistant-entity-access
**Related:** `epic-assistant-entity-access.md`, `epic-assistant-gm-flows.md`
**Status Note:** Done (2026-10-29, branch `r2-entity-access-wrapup`, commits `b65a7eb95`, `526b3ed3b`, `f40cd67fe`). Contracts live in `src/assistant/adapter/entity.ts`: `EntityAdapter` with `kind: DuplicateEntityKind` — character, world, location, item, i.e. all four kinds the ticket lists — plus `LoadedEntity`/`LoadedEntityResult`; the adaptation contract carries a per-field reason (`FieldChange.reason` in `src/assistant/quality/adaptation.ts`). Access-guard composition reuses the existing guards (no new access layer), and the duplication tracking (copied fields plus the overridden subset) travels in the `duplicate-entity` preview payload. DEVIATION: the shared interface is named `EntityAdapter` (the ticket's design block uses both `EntityAccessor` and `EntityAdapter`) and the duplication contract is the preview payload rather than a `DuplicateResult` type. Unit coverage `src/assistant/commands/duplicate.test.ts` + `src/assistant/commands/adapt.test.ts`. Test suites were not re-run in this wrap-up.

## Summary

Define the data contracts and adapter layer for assistant entity access/manipulation commands: entity read/modify/duplicate/adapt interfaces, access guard composition, and the `EntityAdapter` that composes with existing entity services (`insertGeneratedEntity`, `ItemsService`, world/location CRUD).

## Motivation

All assistant entity-access commands need a shared interface for reading entities, applying modifications, and enforcing access guards. Rather than duplicating logic across command handlers, this ticket defines the adapter and schema that every command handler consumes.

## Design

### EntityAdapter Interface

```ts
// src/assistant/adapter/entity.ts

export type EntityKind = "character" | "location" | "world" | "item";

export interface EntityAccessor {
  kind: EntityKind;
  list(filter: EntityFilter): Promise<EntityRef[]>;
  get(id: string): Promise<Entity | null>;
  update(id: string, patch: Partial<Entity>): Promise<Entity>;
  delete(id: string): Promise<void>;
}

export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  description: string | null;
  ownerId: string;
  worldId?: string;
}

export interface EntityFilter {
  ownerId?: string;
  worldId?: string;
  search?: string;
  kind?: EntityKind;
}

export interface EntityRef {
  id: string;
  kind: EntityKind;
  name: string;
}
```

### Access Guard Composition

Commands reuse existing guards — no new access layer:
- Worlds: `requireWorldAccess` / `requireWorldOwner` (from `src/routes/worlds/access.ts`)
- Locations: world access + connections validation
- Characters: `owner_id` match
- Items: `world_id` ownership check (same as `checkWorldOwnership` in `src/routes/story-items/handlers.ts`)

### Duplication Contract

```ts
export interface DuplicateRequest {
  sourceKind: EntityKind;
  sourceId: string;
  overrides?: Partial<Entity>;
}

export interface DuplicateResult {
  newId: string;
  name: string;
  copiedFields: string[];
  overriddenFields: string[];
}
```

### Adaptation Contract

```ts
export interface AdaptRequest {
  sourceKind: EntityKind;
  sourceId: string;
  targetWorldId: string;
  /** Fields to adapt (e.g., "outfit", "knowledge", "background") */
  adaptFields: string[];
}

export interface AdaptResult {
  newId: string;
  changes: FieldChange[];
  explanation: string;
}

export interface FieldChange {
  field: string;
  oldValue: string | null;
  newValue: string;
  reason: string;
}
```

## Tasks

- [ ] Define `EntityAccessor` interface and per-kind implementations
- [ ] Define access guard composition helpers (world, character, item, location)
- [ ] Define duplication and adaptation contracts
- [ ] Write unit tests for the adapter layer

## Acceptance Criteria

- [ ] `EntityAccessor` interface covers all four entity kinds
- [ ] Access guard composition reuses existing guards (no new access layer)
- [ ] Duplication contract includes copied/overridden field tracking
- [ ] Adaptation contract includes per-field change reasons
- [ ] Unit tests pass

## Files

- `src/assistant/adapter/entity.ts` — EntityAccessor interface + per-kind implementations
- `src/assistant/adapter/access.ts` — Access guard composition helpers
- `src/assistant/adapter/duplicate.ts` — Duplication logic
- `src/assistant/adapter/adapt.ts` — Adaptation logic

## Dependencies

- `src/routes/worlds/access.ts` — `requireWorldAccess`, `requireWorldOwner`
- `src/routes/story-items/handlers.ts` — `checkWorldOwnership`
- `src/assistant/quality/entity-creation.ts` — Quality gates (reuse)

**Resolved:** 2026-10-29 registry-driven close: git issue 01c9bfc (registry tip: 616d61643 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-ASSISTANT-ENTITY-ACCESS-SCH)
