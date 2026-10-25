<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Assistant Entity Access & Manipulation

**Overview:** Extends the assistant surface with commands to search, read, modify,
duplicate, and adapt existing world, location, character, item, asset, and
RAG-document entities — the complement to `epic-assistant-gm-flows.md` which
covers *generation* of new entities. Organized into 10 feature areas (RAG,
Asset, World, Location, Character, Item, Addition, Modification, Duplication,
Adaptation) delivered across 6 batches.


**Status:** In Progress
**Status Note:** In Progress (verified 2026-10-18 against `dev` at `08ef7efe7` — by file existence on `dev`, line-level reads of each cited path, and a `git log dev..<branch>` check that excludes unmerged work). The previous "Not Started" note in this file (dated 2026-10-09) was partly false: two of the ten feature areas DO have command handlers in `src/assistant/commands/`. SHIPPED AND LIVE: area 1 (RAG access) — `src/assistant/commands/rag.ts` registers `rag-search` at `:66` (keyword search over `world_lore_entries` + `actor_lore_entries`, world-scoped via `requireWorldAccess`) and `rag-ask` at `:101` (aux-LLM answer over the retrieved context); area 2 (Asset access) — `src/assistant/commands/assets.ts` registers `asset-list` at `:22` (kind-filtered via `listAssets`), `asset-preview` at `:61` (metadata + links, gated by `canAccessAsset`) and `asset-search` at `:99` (`searchAssets`). Both files are imported for side effects by the command barrel (`src/assistant/commands/index.ts:9` and `:31`), so the commands are registered at runtime. Unit coverage ships for every handler (`src/assistant/commands/rag.test.ts`, `src/assistant/commands/assets.test.ts`), including access-denial cases. REMAINS — genuinely absent from `dev`: areas 3 (World), 4 (Location), 5 (Character), 6 (Item & Inventory), 7 (Addition), 8 (Modification), 9 (Duplication) and 10 (Adaptation) have no command files or handlers at all; `/rag-preview` and `/rag-decompose` are unregistered; `/asset-link` is unregistered; there is no `EntityAdapter` layer (`src/assistant/adapter/` does not exist) and no quota engine (`src/assistant/quota/` does not exist), so the epic's "Quota-aware" core principle is unimplemented. NOT COUNTED AS DONE: an unmerged branch `entity-access-batch-a` carries entity read commands (`src/assistant/commands/{worlds-access,locations-access,characters-access,items}.ts` and their tests) plus world-UI panels; those commits are NOT reachable from `dev` and are deliberately excluded from this assessment. The `## Acceptance Criteria` block further down predates the RAG/Asset work and is stale in the same way.
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** assistant, rag, assets, world, location, character, item, inventory, access, manipulation, duplication, adaptation, entity
**Related:** `epic-assistant-gm-flows.md` (generation), `epic-assistant-generation-extensions.md` (SD/intent/scenario), `epic-asset-platform-capabilities.md` (asset substrate), `epic-character-npc-lore-access.md` (character lore access), `epic-lore-knowledge.md` (secret lore), `epic-rag-assets-unified-storage-and-assistant-flows.md` (RAG decomposition)

## Summary

Extends the assistant surface with commands to **search, read, modify, duplicate, and adapt** existing world, location, character, item, asset, and RAG-document entities — the complement to `epic-assistant-gm-flows.md` which covers *generation* of new entities. Enables the user to provision and manipulate computing/knowledge resources through the assistant: retrieve documents via RAG, access assets, manage worlds/locations/characters/items/inventory, duplicate entities with modifications, and adapt entities across contexts (e.g., introducing a new outfit, knowledge, or background story for a character placed in a new world).

## Why this epic exists (the gap)

`epic-assistant-gm-flows.md` covers the assistant **creating** new characters, items, worlds, and locations via `/create`. But the user also needs the assistant to:

1. **Retrieve** — search RAG documents, assets, and entity data on demand
2. **Read** — inspect existing worlds, locations, characters, items, inventory
3. **Modify** — update existing entities through the assistant
4. **Duplicate** — copy an entity with optional changes
5. **Adapt** — re-contextualize an entity for a new world/setting (new outfit, knowledge, background story)

No existing epic owns this **access-and-manipulation** slice. Without it, the assistant can produce new entities but cannot interact with the ones already in the worldbook.

## Core Principles

| Principle | Implementation |
|---|---|
| **Read-only by default** | Retrieval commands (RAG search, asset preview, entity lookup) never mutate state |
| **Compose, don't replace** | Assistant commands reuse existing access guards (`requireWorldAccess`, `requireWorldOwner`, ownership checks) — no new access layer |
| **Explicit confirmation for mutations** | Modify/duplicate/adapt commands require user confirmation before persisting |
| **Context-aware adaptation** | Adaptation takes a source entity and a target context (world/setting); produces a new entity with contextual modifications |
| **Deterministic + replayable** | Same inputs → same outputs; assistant invocations logged with input args + output hash |
| **Quota-aware** | RAG searches and asset operations respect quota (pre-call enforcement) |

## Feature Areas

### 1. RAG Access

Assistant commands to search and retrieve indexed documents/assets at chat time.

| Command | Tool | Output |
|---|---|---|
| `/rag-search <query>` | `ragSearch(query, opts)` | Ranked `DocumentObject` summaries with relevance + tags |
| `/rag-ask <query>` | `answerWithRAG(query)` | LLM call (`ModelRole.Analysis`) over hybrid-retrieved context; streams answer + citations |
| `/rag-preview <doc-id>` | `previewDocument(doc-id)` | Inline panel: original + decomposed + references |
| `/rag-decompose <asset\|doc-id>` | `decomposeDocument(target, kind?)` | Re-run decomposer; return `humanRepr` + `structRepr` |

RAG retrieval composes with the document-as-object model (`epic-rag-assets-unified-storage-and-assistant-flows.md`) when that epic lands; until then, falls back to FTS5 keyword search over existing `documents` rows.

### 2. Asset Access

Assistant commands to browse, preview, and link assets in chat.

| Command | Tool | Output |
|---|---|---|
| `/asset-list [kind]` | `listAssets(kind?)` | Gallery-style asset grid with thumbnails |
| `/asset-preview <asset-id>` | `previewAsset(asset-id)` | Full asset + metadata + links |
| `/asset-link <msg\|asset> <doc>` | `linkAssetToDocument(...)` | Set `documents.source_asset_id`; tooltip chip in chat |
| `/asset-search <query>` | `searchAssets(query)` | FTS5 + pHash hybrid search over assets |

### 3. World Access

Assistant commands to read and modify worlds.

| Command | Tool | Output |
|---|---|---|
| `/world-list` | `listWorlds()` | Owned + public + joined worlds |
| `/world-get <world-id>` | `getWorld(world-id)` | World details + lore + location list |
| `/world-update <world-id> <updates>` | `updateWorld(world-id, updates)` | Modify world metadata (description, lore, etc.) |
| `/world-delete <world-id>` | `deleteWorld(world-id)` | Delete with cascade confirmation |

### 4. Location Access

Assistant commands to read and modify locations within a world.

| Command | Tool | Output |
|---|---|---|
| `/loc-list [world-id]` | `listLocations(world-id?)` | Locations in a world |
| `/loc-get <loc-id>` | `getLocation(loc-id)` | Location details + connections |
| `/loc-update <loc-id> <updates>` | `updateLocation(loc-id, updates)` | Modify location metadata |

### 5. Character Access

Assistant commands to read, modify, and adapt characters.

| Command | Tool | Output |
|---|---|---|
| `/char-list` | `listCharacters()` | Characters owned by user |
| `/char-get <char-id>` | `getCharacter(char-id)` | Character card + stats + lore |
| `/char-update <char-id> <updates>` | `updateCharacter(char-id, updates)` | Modify character fields |
| `/char-adapt <char-id> <new-world>` | `adaptCharacter(char-id, context)` | Adapt character to new world (see Adaptation) |

### 6. Item & Inventory Access

Assistant commands to read, modify, and manage items and inventory.

| Command | Tool | Output |
|---|---|---|
| `/item-list [world-id]` | `listItems(world-id?)` | Item definitions in a world |
| `/item-get <item-id>` | `getItem(item-id)` | Item definition + instances |
| `/item-update <item-id> <updates>` | `updateItem(item-id, updates)` | Modify item definition |
| `/inventory [char-id]` | `listInventory(char-id)` | Items carried by character |
| `/item-transfer <instance-id> <to>` | `transferItem(instance-id, to)` | Transfer item instance to location/character |
| `/item-drop <instance-id>` | `dropItem(instance-id)` | Drop item at current location |
| `/item-pickup <instance-id>` | `pickupItem(instance-id)` | Pick up item from current location |

### 7. Addition

Adding new entities beyond generation — import, create from template, add to existing world.

| Command | Tool | Output |
|---|---|---|
| `/import <kind> <file>` | `importEntity(kind, file)` | Import character/location/world/item from file |
| `/add <kind> <name>` | `addEntity(kind, name, world?)` | Add new entity to existing world |
| `/clone <kind> <source-id>` | `cloneEntity(source-id)` | Start a duplication workflow (see `/duplicate`) |

### 8. Modification

Modifying existing entities through the assistant with quality gating.

| Command | Tool | Output |
|---|---|---|
| `/modify <kind> <id> <description>` | `modifyEntity(kind, id, description)` | LLM-assisted modification with quality gates |
| `/apply <kind> <id> <patch>` | `applyPatch(kind, id, patch)` | Direct field-level patch (no LLM) |

Modification commands reuse the quality-gating pipeline from `src/assistant/quality/entity-creation.ts` (schema validation, duplicate check, consistency check).

### 9. Duplication

Duplicating entities with optional modifications.

| Command | Tool | Output |
|---|---|---|
| `/duplicate <kind> <source-id>` | `duplicateEntity(source-id)` | Create a copy of the source entity |
| `/duplicate <kind> <source-id> --with <changes>` | `duplicateEntity(source-id, changes)` | Copy with specified modifications |

Duplication creates a new entity with copied properties; the user can specify which fields to override (name, description, etc.). For characters, duplication with `--with outfit` copies the base character and adds a new outfit variant.

### 10. Adaptation

Re-contextualizing an entity for a new world/setting.

| Command | Tool | Output |
|---|---|---|
| `/adapt <kind> <source-id> --to <target-world>` | `adaptEntity(source-id, target-world)` | Adapt entity to target world |

Adaptation examples:

- **Character → new world**: Introduce a new outfit, knowledge, or background story adapted to the target world's setting
- **Item → new world**: Adjust item properties (rarity, category) to fit the target world's economy
- **Location → new world**: Clone a location with world-specific lore

Adaptation uses the LLM to generate context-aware modifications, then applies quality gates and requires user confirmation.

## Design: Command Architecture

Commands compose with the existing assistant command registry (`src/assistant/commands/registry.ts`):

```ts
registerCommand("rag-search", ragSearchHandler, { requiredRole: "member" });
registerCommand("char-adapt", charAdaptHandler, { requiredRole: "owner" });
registerCommand("duplicate", duplicateHandler, { requiredRole: "owner" });
registerCommand("adapt", adaptHandler, { requiredRole: "owner" });
```

Each mutation handler follows the pattern:

1. Validate access (world ownership / entity ownership)
2. Build the operation (LLM-assisted or direct)
3. Apply quality gates
4. Request user confirmation
5. Persist the result

## Design: Adaptation Engine

Adaptation takes a source entity and a target context, then produces a context-aware modification:

```ts
interface AdaptationRequest {
  sourceKind: EntityKind;
  sourceId: string;
  targetWorldId: string;
  adaptFields: string[];
}

interface AdaptationResult {
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

The adaptation engine:

1. Loads the source entity and target world lore/setting
2. Generates context-aware modifications via the LLM
3. Applies quality gates (schema, consistency, duplicate)
4. Requires user confirmation
5. Persists the adapted entity as a new record (or updates if `--force`)

## Non-Goals

- Entity **generation** from scratch (`/create`) — owned by `epic-assistant-gm-flows.md`
- RAG document **processing/decomposition** — owned by `epic-rag-assets-unified-storage-and-assistant-flows.md`
- Asset platform **infrastructure** (renditions, dedup, GC) — owned by `epic-asset-platform-capabilities.md`
- Character/NPC **lore access** based on personal history/skills — owned by `epic-character-npc-lore-access.md`
- Secret lore with rarity-based access — owned by `epic-lore-knowledge.md`
- Federation/swarm entity sharing
- Emotion avatar generation/regeneration

## Acceptance Criteria

(status verified 2026-10-18 against `dev`)

- [ ] RAG search/ask commands work end-to-end with FTS5 fallback — `/rag-search` and `/rag-ask` ship (`rag.ts:66`, `:101`) but search LORE tables by keyword, not `documents` via FTS5; `/rag-preview` and `/rag-decompose` are unregistered
- [x] Asset list/preview/search commands return correct results — `assets.ts:22`, `:61`, `:99`, covered by `assets.test.ts`
- [ ] World/location/character/item CRUD commands enforce ownership guards — no command files exist for these areas on `dev`
- [ ] Inventory commands track character-held items — absent
- [ ] Duplication creates a new entity with copied + modified fields — absent
- [ ] Adaptation produces context-aware modifications with quality gates — absent
- [ ] All mutation commands require user confirmation — no mutation commands exist yet
- [ ] All commands compose with existing access guards (no new access layer) — true for the five shipped commands (they call `requireWorldAccess` / `canAccessAsset`); unproven for the rest
- [ ] Unit tests for all command handlers — `rag.test.ts` and `assets.test.ts` cover the five shipped handlers; nothing covers the unbuilt areas
- [ ] E2E tests for the full command flow (chat → command → response)

## Tasks

### B1 — RAG + Asset Access (MVP)

- [ ] `/rag-search` command + FTS5 fallback
- [ ] `/rag-ask` command with LLM analysis
- [ ] `/asset-list` command
- [ ] `/asset-preview` command
- [ ] `/asset-search` command

### B2 — World + Location Access

- [ ] `/world-list` command
- [ ] `/world-get` command
- [ ] `/loc-list` command
- [ ] `/loc-get` command
- [ ] `/loc-update` command

### B3 — Character + Item + Inventory Access

- [ ] `/char-list` command
- [ ] `/char-get` command
- [ ] `/item-list` command
- [ ] `/inventory` command
- [ ] `/item-transfer` command
- [ ] `/item-drop` command
- [ ] `/item-pickup` command

### B4 — Modification + Addition

- [x] `/modify` command with quality gates
- [x] `/apply` command for direct patches
- [x] `/import` command
- [x] `/add` command
- [x] `/clone` command

### B5 — Duplication + Adaptation

- [ ] `/duplicate` command
- [ ] `/adapt` command
- [ ] Adaptation engine with quality gates

### B6 — Tests

- [ ] Unit tests for all command handlers
- [ ] E2E tests for full command flow

## Files

- `src/assistant/commands/rag.ts` — `/rag-search`, `/rag-ask`, `/rag-preview`, `/rag-decompose` (TODO)
- `src/assistant/commands/assets.ts` — `/asset-list`, `/asset-preview`, `/asset-link`, `/asset-search` (TODO)
- `src/assistant/commands/worlds-access.ts` — `/world-list`, `/world-get`, `/world-update`, `/world-delete` (TODO)
- `src/assistant/commands/locations.ts` — `/loc-list`, `/loc-get`, `/loc-update` (TODO)
- `src/assistant/commands/characters-access.ts` — `/char-list`, `/char-get`, `/char-update`, `/char-adapt` (TODO)
- `src/assistant/commands/items.ts` — `/item-list`, `/item-get`, `/item-update`, `/inventory`, `/item-transfer`, `/item-drop`, `/item-pickup` (TODO)
- `src/assistant/commands/apply.ts` — `/apply`
- `src/assistant/commands/modify.ts` — `/modify`
- `src/assistant/commands/clone.ts` — `/clone`
- `src/assistant/commands/duplicate.ts` — `/duplicate` (TODO)
- `src/assistant/commands/adapt.ts` — `/adapt` (TODO)
- `src/assistant/commands/import.ts` — `/import`, `/add`
- `src/assistant/quality/adaptation.ts` — Adaptation quality gates (TODO)
- `src/assistant/adapter/` — Entity adapter composing with existing services (TODO)
- `src/assistant/commands/registry.ts` — command registry (exists)
- `src/assistant/quality/entity-creation.ts` — quality-gating pipeline (exists)
- `src/routes/worlds/worlds.ts` — world access guards (exists)
- `src/routes/story-items/handlers.ts` — item transfer logic (exists)

## Tickets

Filed per batch/feature area; ticket statuses verified 2026-10-18 against `dev` (In Progress = partial ship, Not Started = no code on `dev`):

- `TASK-assistant-entity-access-schema.md` — EntityAdapter interface + command scaffolding
- `TASK-assistant-entity-access-batch-rag-asset.md` — B1 RAG + Asset Access MVP
- `TASK-assistant-entity-access-rag-access.md` — `/rag-search`, `/rag-ask`, `/rag-preview`, `/rag-decompose`
- `TASK-assistant-entity-access-asset-access.md` — `/asset-list`, `/asset-preview`, `/asset-link`, `/asset-search`
- `TASK-assistant-entity-access-world-location-access.md` — B2 world + location access
- `TASK-assistant-entity-access-character-item-inventory.md` — B3 character/item/inventory access
- `TASK-assistant-entity-access-modification-addition.md` — B4 modification + addition (`/modify`, `/apply`, `/import`, `/add`, `/clone`)
- `TASK-assistant-entity-access-duplication.md` — B5 duplication
- `TASK-assistant-entity-access-adaptation.md` — B5 adaptation engine
- `TASK-assistant-entity-access-quota-engine.md` — quota enforcement for RAG/asset operations
- `TASK-assistant-entity-access-adapter.md` — entity adapter composing with existing services
- `TASK-assistant-entity-access-tests.md` — unit tests for command handlers
- `TASK-assistant-entity-access-e2e.md` — E2E command flow tests

Dependency tickets (not owned by this epic): `TASK-rag-knowledge-graph.md`, `FEAT-memory-visualizer-knowledge-graph-over-asset-links.md` (both Not Started).

## Batches

### B1 — RAG + Asset Access (MVP)

Commands: `/rag-search`, `/rag-ask`, `/asset-list`, `/asset-preview`, `/asset-search`
Gates: FTS5 search works, asset preview returns correct data, quota enforcement

### B2 — World + Location Access

Commands: `/world-list`, `/world-get`, `/loc-list`, `/loc-get`, `/loc-update`
Gates: Ownership guards enforced, CRUD works end-to-end

### B3 — Character + Item + Inventory Access

Commands: `/char-list`, `/char-get`, `/item-list`, `/inventory`, `/item-transfer`, `/item-drop`, `/item-pickup`
Gates: Character ownership, item ownership, inventory tracking

### B4 — Modification + Addition

Commands: `/modify`, `/apply`, `/import`, `/add`, `/clone`
Gates: Quality gates apply, user confirmation required

### B5 — Duplication + Adaptation

Commands: `/duplicate`, `/adapt`
Gates: Duplication creates valid new entity, adaptation produces context-aware modifications

### B6 — Tests

Unit tests for all command handlers and the adaptation engine; E2E tests for the full command flow

## References

- `epic-assistant-gm-flows.md` — generation (complementary epic)
- `epic-asset-platform-capabilities.md` — asset substrate
- `epic-rag-assets-unified-storage-and-assistant-flows.md` — RAG decomposition (separate worktree)
- `epic-character-npc-lore-access.md` — character lore access (separate epic)
- `epic-lore-knowledge.md` — secret lore with rarity-based access
- `epic-assistant-generation-extensions.md` — SD/intent/scenario source
- `src/assistant/commands/registry.ts` — command registry (compose with)
- `src/assistant/quality/entity-creation.ts` — quality-gating pipeline (reuse)
- `src/routes/worlds/worlds.ts` — world access guards (`requireWorldAccess`, `requireWorldOwner`)
- `src/routes/story-items/handlers.ts` — item transfer logic
