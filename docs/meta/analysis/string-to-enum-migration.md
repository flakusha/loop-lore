<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# String → Enum Migration Analysis

Audit of all string-typed fields across schema and config types. Goal: migrate `string` to typed enums where value set is fixed and known.

## Status Summary

| Category                               | Count     | Status      |
| -------------------------------------- | --------- | ----------- |
| Already enum-typed (schema)            | 43 fields | Good        |
| Plain `string` → needs enum (schema)   | 12 fields | Fix         |
| Inline union → needs enum ref (config) | 10 fields | Fix         |
| False positive (freeform/JSON)         | 7 fields  | Keep string |

---

## Part 1: Schema Tables — Plain `string` to Enum

### schema-core.ts

| Table                | Field       | Target Enum     | Values                                                  |
| -------------------- | ----------- | --------------- | ------------------------------------------------------- |
| `ActorKeys`          | `key_type`  | `KeyType`       | signing, encryption, symmetric, master                  |
| `ActorKeys`          | `status`    | `KeyStatus`     | active, expired, revoked                                |
| `ActorNotes`         | `category`  | `NoteCategory`  | general, world, character, story, combat, session       |
| `ActorItems`         | `item_type` | `ActorItemType` | equipment, consumable, key, artifact, misc              |
| `ModelRoleOverrides` | `role`      | `ModelRole`     | main, captioning, moderation, embeddings, summarization |

### schema-story.ts

| Table              | Field               | Target Enum        | Values                                 |
| ------------------ | ------------------- | ------------------ | -------------------------------------- |
| `WorldItems`       | `visibility`        | `ItemVisibility`   | visible, hidden (enum already exists!) |
| `ActorMemories`    | `memory_type`       | `MemoryType`       | episodic, semantic, procedural         |
| `ActorLoreEntries` | `position`          | `LorePosition`     | before_char, after_char, in_char       |
| `WorldLoreEntries` | `position`          | `LorePosition`     | (reuse same enum)                      |
| `Worlds`           | `difficulty_reroll` | `DifficultyReroll` | none, per_turn, per_quest              |
| `Worlds`           | `difficulty_state`  | `DifficultyState`  | normal, hard, extreme, custom          |

### schema-content.ts

| Table        | Field         | Target Enum       | Values                                                       |
| ------------ | ------------- | ----------------- | ------------------------------------------------------------ |
| `AssetLinks` | `entity_type` | `AssetLinkEntity` | chat, character, world, actor, location, quest, item, memory |

---

## Part 2: Config Schema — Inline Unions → Enum Refs

All in `src/config/schema.ts`.

### Already have enum, just not referenced

| Config Field                         | Should Use             | Values                                    |
| ------------------------------------ | ---------------------- | ----------------------------------------- |
| `TransportCompressionConfig.default` | `CompressionAlgorithm` | zstd, br, gzip, none                      |
| `TransportConfig.defaultProtocol`    | `TransportProtocol`    | http/1.1, http/2, http/3, websocket, etc. |

### Need new enum

| Config Field                              | Suggested Enum                                         | Values                                |
| ----------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `DynamicResponseConfig.compressAlgorithm` | `ResponseCompression` or extend `CompressionAlgorithm` | br, gzip, auto                        |
| `EncryptionConfig.compressAlgorithm`      | `EncryptionCompression`                                | gzip, brotli, zstd                    |
| `ImageProviderConfig.apiFamily`           | `ImageApiFamily`                                       | openai, sdapi, sdcpp                  |
| `HeadersConfig.xFrameOptions`             | `XFrameOption`                                         | deny, sameorigin                      |
| `HeadersConfig.crossOriginOpenerPolicy`   | `CrossOriginOpenerPolicy`                              | same-origin, same-origin-allow-popups |
| `HeadersConfig.crossOriginEmbedderPolicy` | `CrossOriginEmbedderPolicy`                            | require-corp                          |
| `HeadersConfig.crossOriginResourcePolicy` | `CrossOriginResourcePolicy`                            | same-origin, cross-origin             |
| `SdCppAutoStartConfig.modelType`          | `SdModelType`                                          | checkpoint, diffusion                 |

### Debatable (keep string)

`SdCppAutoStartConfig` cache/backend/rng fields, `LlamaCppAutoStartConfig` hardware fields, `ImageProviderDefaults` sampler/scheduler — vendor-dependent strings, enums would go stale fast.

---

## Part 3: False Positives — Keep `string`

| Field                        | Table        | Why Not Enum                 |
| ---------------------------- | ------------ | ---------------------------- |
| `ActorItems.tags`            | schema-core  | JSON array, freeform         |
| `ActorItems.metadata`        | schema-core  | JSON blob                    |
| `ActorItems.value`           | schema-core  | Variable format              |
| `NpcStates.mental_state`     | schema-story | Narrative text               |
| `NpcStates.knowledge`        | schema-story | JSON blob                    |
| `NpcStates.relations`        | schema-story | JSON blob                    |
| `WorldItems.spawn_condition` | schema-story | Freeform narrative condition |

---

## Migration Priorities

### Phase 1 — Quick wins (no DB migration needed)

1. `WorldItems.visibility` → `ItemVisibility` (enum exists, just change type)
2. Config inline unions → reference existing enums (`CompressionAlgorithm`, `TransportProtocol`)

### Phase 2 — New enums needed (schema only)

### Phase 3 — New enums needed (schema + config)

---

## Enum File Placement

| Enum                                                                                                                                                                                 | File               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `KeyType`, `KeyStatus`, `NoteCategory`, `ActorItemType`, `ModelRole`                                                                                                                 | `enums-core.ts`    |
| `MemoryType`, `LorePosition`, `DifficultyReroll`, `DifficultyState`                                                                                                                  | `enums-story.ts`   |
| `AssetLinkEntity`                                                                                                                                                                    | `enums-content.ts` |
| `ResponseCompression`, `EncryptionCompression`, `ImageApiFamily`, `XFrameOption`, `CrossOriginOpenerPolicy`, `CrossOriginEmbedderPolicy`, `CrossOriginResourcePolicy`, `SdModelType` | `enums-config.ts`  |

---

## Impact Assessment

**Breaking changes:** Schema type changes are compile-time only. Kysely `Generated<string>` means DB column type doesn't change — SQLite stores everything as text. No migration SQL needed.

**Runtime validation:** Existing state machines (`src/db/state.ts`) validate transitions. New enums needing state machines: `KeyStatus` (active → expired, active → revoked).

**Config validation:** `ConfigSchema` class validates at load time. Enums tighten type checking and create single source of truth.

**Risk:** Low. All changes are type-level only. DB values don't change.
