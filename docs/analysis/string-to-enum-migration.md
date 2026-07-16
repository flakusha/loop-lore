# String → Enum Migration Analysis

Audit of all string-typed fields across schema tables and config types.
Goal: migrate `string` to typed enums where the value set is fixed and known.

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

#### ActorKeys — 2 fields

```
key_type: string   → KeyType    values: signing | encryption | symmetric | master
status: string     → KeyStatus  values: active | expired | revoked
```

**Rationale:** ActorKeys store cryptographic key identities. `key_type` discriminates
usage; `status` tracks lifecycle. Both have fixed value sets.

#### ActorNotes — 1 field

```
category: string   → NoteCategory  values: general | world | character | story | combat | session
```

**Rationale:** Notes have a classification dimension. SillyTavern uses similar
categories for character notes. Fixed set prevents typos in filters.

#### ActorItems — 1 field

```
item_type: string  → ActorItemType  values: equipment | consumable | key | artifact | misc
```

**Rationale:** `ItemCategory` (from enums-story) exists but is world-scoped
(weapon, armor, consumable...). Actor-scoped items are a different taxonomy.
Could also just reuse `ItemCategory` if the domains overlap enough. Decide
which — either reuse or new enum.

#### ModelRoleOverrides — 1 field

```
role: string       → ModelRole  values: main | captioning | moderation | embeddings | summarization
```

**Rationale:** Matches `modelRoles` config object keys. Already has implicit
fixed set used in config validation. Make it explicit.

### schema-story.ts

#### WorldItems — 1 field

```
visibility: string → ItemVisibility  (enum already exists!)
```

**Rationale:** `ItemVisibility` enum (`visible | hidden`) already defined in
enums-story.ts. `WorldItems.visibility` uses plain `string` — just missed
during initial enum migration. Lowest-hanging fruit.

#### ActorMemories — 1 field

```
memory_type: string → MemoryType  values: episodic | semantic | procedural
```

**Rationale:** Three-tier memory system (docs/spec/memory-system.md) defines
exactly three types. Fixed set, already documented.

#### ActorLoreEntries — 1 field

```
position: string   → LorePosition  values: before_char | after_char | in_char
```

**Rationale:** Character book (lorebook) entries are inserted at specific
positions relative to character definition. SillyTavern/RisuAI convention
offers three positions. Fixed set.

#### WorldLoreEntries — 1 field

```
position: string   → LorePosition  (same enum, reuse)
```

**Rationale:** Same as ActorLoreEntries — world lore entries use identical
position semantics.

#### Worlds — 2 fields

```
difficulty_reroll: string  → DifficultyReroll  values: none | per_turn | per_quest
difficulty_state: string   → DifficultyState   values: normal | hard | extreme | custom
```

**Rationale:** World difficulty system. `reroll` defines strategy; `state`
tracks current phase. Both have small fixed value sets per
docs/spec/rpg-mechanics.md.

### schema-content.ts

#### AssetLinks — 1 field

```
entity_type: string → AssetLinkEntity  values: chat | character | world | actor | location | quest | item | memory
```

**Rationale:** Polymorphic asset linking. `entity_type` is the discriminator
for the `entity_id` FK. Currently plain string — means no compiler check that
you're passing a valid entity table name. Making it an enum catches typos at
compile time.

---

## Part 2: Config Schema — Inline Unions → Enum Refs

All in `src/config/schema.ts`. These use inline string unions where an enum
already exists (or should exist).

### Already have enum, just not referenced

| Config Field                         | Type                                 | Should Use             | Enum Values                                                 |
| ------------------------------------ | ------------------------------------ | ---------------------- | ----------------------------------------------------------- |
| `TransportCompressionConfig.default` | `"zstd" \| "br" \| "gzip" \| "none"` | `CompressionAlgorithm` | zstd, br, gzip, none                                        |
| `TransportConfig.defaultProtocol`    | `"http/1.1" \| "http/2" \| ...`      | `TransportProtocol`    | http/1.1, http/2, http/3, websocket, webtransport, tcp, tls |

### Need new enum (inline union with no existing match)

| Config Field                              | Inline Type                                           | Suggested Enum                                         | Values                                |
| ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `DynamicResponseConfig.compressAlgorithm` | `"br" \| "gzip" \| "auto"`                            | `ResponseCompression` or extend `CompressionAlgorithm` | br, gzip, auto                        |
| `EncryptionConfig.compressAlgorithm`      | `"gzip" \| "brotli" \| "zstd"`                        | `EncryptionCompression`                                | gzip, brotli, zstd                    |
| `ImageProviderConfig.apiFamily`           | `"openai" \| "sdapi" \| "sdcpp"`                      | `ImageApiFamily`                                       | openai, sdapi, sdcpp                  |
| `HeadersConfig.xFrameOptions`             | `"DENY" \| "SAMEORIGIN" \| null`                      | `XFrameOption`                                         | deny, sameorigin                      |
| `HeadersConfig.crossOriginOpenerPolicy`   | `"same-origin" \| "same-origin-allow-popups" \| null` | `CrossOriginOpenerPolicy`                              | same-origin, same-origin-allow-popups |
| `HeadersConfig.crossOriginEmbedderPolicy` | `"require-corp" \| null`                              | `CrossOriginEmbedderPolicy`                            | require-corp                          |
| `HeadersConfig.crossOriginResourcePolicy` | `"same-origin" \| "cross-origin" \| null`             | `CrossOriginResourcePolicy`                            | same-origin, cross-origin             |
| `SdCppAutoStartConfig.modelType`          | `"checkpoint" \| "diffusion"`                         | `SdModelType`                                          | checkpoint, diffusion                 |

### Debatable: too many values, keep string

| Page/Facet                | Fields                                                                                                                                     | Values                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `SdCppAutoStartConfig`    | `cacheTypeK`, `cacheTypeV`, `cacheTypeKD`, `cacheTypeVD`, `ropeScaling`, `backend`, `rng`, `samplerRng`, `type`, `prediction`, `cacheMode` | Hardware-dependent, vendor-specific string sets. Enum would go stale fast. |
| `LlamaCppAutoStartConfig` | `cacheTypeK`, `cacheTypeV`, `cacheTypeKD`, `cacheTypeVD`, `flashAttn`, `ropeScaling`, `specType`                                           | Same — hardware/protocol strings.                                          |
| `ImageProviderDefaults`   | `sampler`, `scheduler`                                                                                                                     | Large set (euler, euler_a, dpmpp_2m, dpm_sde, ...). Too varied.            |

---

## Part 3: False Positives — Keep as `string`

These look like enum candidates but are not:

| Field                        | Table        | Why Not Enum                           |
| ---------------------------- | ------------ | -------------------------------------- |
| `ActorItems.tags`            | schema-core  | JSON array, freeform                   |
| `ActorItems.metadata`        | schema-core  | JSON blob                              |
| `ActorItems.value`           | schema-core  | Variable format (gold, "10gp", "rare") |
| `NpcStates.mental_state`     | schema-story | Narrative text ("calm but tense")      |
| `NpcStates.knowledge`        | schema-story | JSON blob                              |
| `NpcStates.relations`        | schema-story | JSON blob                              |
| `WorldItems.spawn_condition` | schema-story | Freeform narrative condition           |

---

## Migration Priorities

### Phase 1 — Quick wins (no DB migration needed)

1. `WorldItems.visibility` → `ItemVisibility` (enum exists, just change type)
2. Config inline unions → reference existing enums (`CompressionAlgorithm`, `TransportProtocol`)

### Phase 2 — New enums needed (schema only)

3. `ActorKeys.key_type` → `KeyType`
4. `ActorKeys.status` → `KeyStatus`
5. `ActorNotes.category` → `NoteCategory`
6. `ActorItems.item_type` → `ActorItemType` (or reuse `ItemCategory`)
7. `ModelRoleOverrides.role` → `ModelRole`

### Phase 3 — New enums needed (schema + config)

8. `ActorMemories.memory_type` → `MemoryType`
9. `ActorLoreEntries.position` + `WorldLoreEntries.position` → `LorePosition`
10. `Worlds.difficulty_reroll` → `DifficultyReroll`
11. `Worlds.difficulty_state` → `DifficultyState`
12. `AssetLinks.entity_type` → `AssetLinkEntity`
13. Config new enums: `ResponseCompression`, `EncryptionCompression`, `ImageApiFamily`, HTTP header enums, `SdModelType`

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

**Breaking changes:** Schema type changes are compile-time only. Kysely
`Generated<string>` means DB column type doesn't change — SQLite stores
everything as text. No migration SQL needed for enum changes.

**Runtime validation:** Current state machines (`src/db/state.ts`) already
validate transitions for many status fields. New enums that need state
machines: `KeyStatus` (active → expired, active → revoked).

**Config validation:** Current `ConfigSchema` class validates config at load
time. Inline unions in config types provide partial compile-time checking
already — replacing with enums tightens further and creates single source of
truth.

**Risk:** Low. All changes are type-level only. DB values don't change.
