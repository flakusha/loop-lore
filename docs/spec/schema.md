# Database Schema

> **Primary source of truth:** `src/db/migrations/001_init.ts` (DDL) and `src/db/schema-*.ts` (Kysely types).
> This doc covers **design rationale only**. For exact columns, types, constraints, and indexes,
> read the source files linked below. Do not maintain inline column descriptions here.

## Overview

Core tables for loop-lore. Designed for:

- SQLite via `bun:sqlite` (native, default, zero-config)
- [Kysely](https://kysely.dev/) for type-safe queries (layered on bun:sqlite)
- Postgres via Kysely dialect swap when scaling up

27 tables across 5 domain groups.

## Source Files

| File                            | Tables                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/db/migrations/001_init.ts` | DDL for all core tables (parts/ directory) — column types, constraints, defaults, indexes                                                                          |
| `src/db/schema-core.ts`         | Users, Sessions, Chats, Actors, ChatParticipants, Characters, Messages, ActorKeys, ActorItems, ActorNotes, UserApiKeys                                             |
| `src/db/schema-content.ts`      | Assets, AssetLinks                                                                                                                                                 |
| `src/db/schema-generation.ts`   | GenerationAttempts                                                                                                                                                 |
| `src/db/schema-story.ts`        | Worlds, Locations, Items, WorldItems, StoryTurns, Quests, QuestProgress, WorldStates, NpcStates, LocationStates, ActorMemories, ActorLoreEntries, WorldLoreEntries |
| `src/db/schema-synthetic.ts`    | SyntheticData                                                                                                                                                      |

Centralized enum definitions: `src/db/enums-*.ts` domain files (core, content, generation, story, config),
re-exported via `src/db/enums.ts` barrel.

### Bare String Columns Requiring Enum Types

These columns use bare `string` types but have a bounded set of values.
Should be converted to proper enums with CHECK constraints:

| Table                  | Column        | Current default | Proposed enum                                                  | Reason                                                                         |
| ---------------------- | ------------- | --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `actor_keys`           | `status`      | `"active"`      | `KeyStatus { active, expired, revoked }`                       | De-facto 3-state lifecycle; state machine: active→{expired,revoked} (terminal) |
| `actor_keys`           | `key_type`    | —               | `KeyType { primary, backup }`                                  | De-facto single value `"primary"`                                              |
| `actor_memories`       | `memory_type` | `"fact"`        | `MemoryType { fact, episodic, semantic, procedural }`          | Used in prompt formatting + API filter                                         |
| `actor_notes`          | `category`    | `"general"`     | `NoteCategory { general, personality, history, plot, system }` | Simple classifier                                                              |
| `world_items`          | `visibility`  | `"visible"`     | `ItemVisibility`                                               | Enum exists at `enums-story.ts:137` — not wired to schema                      |
| `model_role_overrides` | `role`        | —               | reuse `UserRole` or `SystemRole`                               | Primary-key discriminator                                                      |

### Schema-Migration Mismatches

| Issue                                         | Schema location                    | Migration location                                                                   |
| --------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| ~~`chats.purpose` vs `chat_purpose`~~         | `schema-core.ts:72` uses `purpose` | **Fixed in 019**: dropped redundant `chat_purpose` column                            |
| `actor_keys.public_key` added later           | `schema-core.ts:199` field defined | `006_messages_keys.ts` does not create column; **added in 017**                      |
| Migrations 008-010 run cleanly after 001_init | `001_init.ts` parts                | Parts unsquashed: 001 creates only pre-008 schema; 008-010 add columns incrementally |

## Entity Relationships

- **Users** — 1:N → Sessions, Actors (as `actor_type='user'`), Actors (as owner of `actor_type='character'`)
- **Actors** — M:N → Chats (via `chat_participants`); 1:N → Messages, Assets, NpcStates, GenerationAttempts, ActorMemories, ActorNotes, ActorItems, ActorLoreEntries; M:N → Worlds (via `WorldLoreEntries`)
- **Chats** — 1:N → Messages, Assets, GenerationAttempts, StoryTurns, QuestProgress, SyntheticData; M:N → Worlds (via `asset_links`)
- **Worlds** — 1:N → Items, Locations, Quests, WorldStates, NpcStates, LocationStates, SyntheticData
- **Items** — 1:N → WorldItems (item instances in locations / carried by NPCs)
- **Messages** — 1:N → Messages (self-referential via `parent_id` tree model), GenerationAttempts (via `parent_message_id`)
- **GenerationAttempts** — 1:N → GenerationAttempts (self-referential via `parent_attempt_id` continuation chains)

## Design Decisions

### No Boolean Flags — Enums Instead

The schema explicitly avoids boolean flags in favor of enum/text columns.
Each enum encodes a state machine rather than a binary on/off:

| Column                              | Values                                                                                                                     | What it replaces                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `users.role`                        | `admin`, `user`, `viewer`, `solo`                                                                                          | An `is_admin` boolean                                 |
| `users.status`                      | `active`, `disabled`, `deactivated`                                                                                        | An `is_active` boolean                                |
| `messages.visibility`               | `visible`, `hidden_by_user`, `hidden_by_moderator`, `auto_hidden`, `redacted`                                              | A `hidden` boolean + separate `hidden_reason` column  |
| `messages.status`                   | `sending`, `confirmed`, `failed`, `partial`, `rejected`, `cancelled`                                                       | Message lifecycle state                               |
| `messages.content_type`             | `text`, `action`, `narration`, `system`, `continuation`                                                                    | A `content_type` field                                |
| `messages.content_format`           | `markdown` (default)                                                                                                       | A `format` field                                      |
| `messages.content_encoding`         | `identity`, `gzip`, `zstd`, `brotli`                                                                                       | A `encoding` field                                    |
| `actors.actor_type`                 | `user`, `character`, `narrator`, `system`                                                                                  | Polymorphic `(participant_type, participant_id)` pair |
| `actors.agent_type`                 | `none`, `ai`, `narrator`, `npc`                                                                                            | An `is_bot` boolean                                   |
| `actors.visibility`                 | `private`, `public`                                                                                                        | A `visibility` flag                                   |
| `characters.agent_type`             | `none`, `ai`, `narrator`, `npc`                                                                                            | An `is_bot` boolean (legacy characters)               |
| `assets.asset_type`                 | `image`, `audio`, `video`, `memory`, `other`                                                                               | Content type discriminator                            |
| `chats.type`                        | `direct`, `group`                                                                                                          | A `type` flag (formerly `is_group`)                   |
| `chats.mode`                        | `direct`, `group`, `story`                                                                                                 | A `mode` flag (formerly `is_story`)                   |
| `generation_attempts.status`        | `pending`, `processing`, `streaming`, `completed`, `failed`, `cancelled`                                                   | A single `done` boolean                               |
| `generation_attempts.cancel_source` | `user`, `auto_repetition`, `auto_policy`, `auto_limit`, `chat_switch`, `system`                                            | Cancellation source indicator                         |
| `quests.type`                       | `time`, `collection`, `destruction`, `rescue`, `discovery`, `social`, `composite`                                          | Quest category flag                                   |
| `quests.status`                     | `active`, `completed`, `failed`, `abandoned`                                                                               | A `completed` boolean                                 |
| `quest_progress.status`             | `active`, `completed`, `failed`, `ignored`                                                                                 | Progress status flag                                  |
| `location_states.items_available`   | (string default `"[]"` — JSON array)                                                                                       | Item availability indicator                           |
| `synthetic_data.type`               | `turn_sequence`, `quality_evaluation`, `quest_progression`, `world_state_transition`, `regeneration_case`, `gm_escalation` | Synthetic data category                               |
| `synthetic_data.status`             | `generated`, `validated`, `approved`, `rejected`, `archived`                                                               | Synthetic data lifecycle flag                         |
| `chats.is_pinned`                   | `unpinned`, `pinned`                                                                                                       | A `is_pinned` boolean                                 |
| `personas.is_default`               | `not_default`, `default`                                                                                                   | A `is_default` boolean                                |
| `actor_notes.pinned`                | `unpinned`, `pinned`                                                                                                       | A `pinned` boolean                                    |
| `actor_items.equipped`              | `unequipped`, `equipped`                                                                                                   | An `equipped` boolean                                 |
| `items.stackable`                   | `unique`, `stackable`                                                                                                      | A `stackable` boolean                                 |

### Remaining Boolean Flags (not yet migrated)

These booleans are genuine singular properties or orthogonal flags,
**not** state machine candidates — they stay as-is:

| Table                | Column           | Default | Reason                             |
| -------------------- | ---------------- | ------- | ---------------------------------- |
| `world_items`        | `respawnable`    | `0`     | Intrinsic property                 |
| `actor_lore_entries` | `selective`      | `0`     | Orthogonal flag (relevance gating) |
| `actor_lore_entries` | `case_sensitive` | `0`     | Orthogonal flag (key matching)     |
| `actor_lore_entries` | `constant`       | `0`     | Orthogonal flag (always included)  |
| `world_lore_entries` | `selective`      | `0`     | Same (mirror table)                |
| `world_lore_entries` | `case_sensitive` | `0`     | Same (mirror table)                |
| `world_lore_entries` | `constant`       | `0`     | Same (mirror table)                |

### Migrated Boolean Flags (Resolved 2026-07-15)

These columns were converted from integer 0/1 to string enums with state machines:

| Table         | Column       | Old type    | New enum         | Migration |
| ------------- | ------------ | ----------- | ---------------- | --------- |
| `chats`       | `is_pinned`  | `INTEGER 0` | `PinnedState`    | 010       |
| `personas`    | `is_default` | `INTEGER 0` | `DefaultState`   | 010       |
| `actor_notes` | `pinned`     | `INTEGER 0` | `PinnedState`    | 010       |
| `actor_items` | `equipped`   | `INTEGER 0` | `EquipState`     | 010       |
| `items`       | `stackable`  | `INTEGER 0` | `StackableState` | 010       |

### Implemented: Lore Entry Lifecycle State Machine

The `enabled` column on `actor_lore_entries` and `world_lore_entries` was
converted from integer 0/1 to a text enum (`LoreEntryStatus`) supporting:

| Enum              | Values                            | Transitions                                           |
| ----------------- | --------------------------------- | ----------------------------------------------------- |
| `LoreEntryStatus` | `enabled`, `disabled`, `archived` | `enabled ↔ disabled`, `enabled → archived` (terminal) |

**Rationale:** An `archived` state lets users retire lore entries that should
not appear in prompts without fully deleting them (currently requires
setting `enabled=0` with no distinction between "disabled temporarily" and
"archived permanently"). The other three booleans (`selective`, `case_sensitive`,
`constant`) stay as orthogonal flags — they describe entry behavior, not lifecycle.

- **Migration 017**: converted column type from INTEGER to TEXT
- **Migration (enum update 2026-07-17)**: added `Archived = "archived"` to `LoreEntryStatus` enum

### Unified Actor Table (replaces separate characters table)

Instead of separate nullable `user_id` and `character_id` foreign keys on `messages`,
and instead of a polymorphic `(participant_type, participant_id)` pair on `chat_participants`,
all participants are unified in the `actors` table (see [actors.md](./actors.md)):

```sql
actors (id, actor_type, display_name, user_id, owner_id, agent_type, ...)
```

A message has a single `actor_id` FK. A chat participant has a single `actor_id` FK.
The `actor_type` discriminator tells you what kind of actor it is.

### Message Tree Model

Messages form a tree via `parent_id` instead of a flat list:

- The root of a conversation has `parent_id = NULL`
- Replies are children of the message they reply to
- Swipe variants share the same `parent_id` (siblings, not children)
- Continuation messages are children of partial/cancelled messages
- The visible timeline is an in-order traversal of the active leaf path

### Centralized Enum Source

All enum values are defined in `src/db/enums-*.ts` domain files (core, content, generation, story, config), re-exported via the `src/db/enums.ts` barrel.
Domain packages (generation, story, assets, etc.) import from the barrel and re-export for convenience.

---

## Migration Strategy

Migrations are managed by Kysely Migrator and stored in `src/db/migrations/`.
Run via `src/db/migrate.ts`.

For the current active-development phase (no production data), migrations are
linear with `up()`/`down()` exports. When the schema stabilises, the migration
chain can be squashed into a single `001_init.ts` that creates all tables at once.

### Current Migration Sequence

| #   | File                               | Tables                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | `001_init.ts`                      | All core tables: users, sessions, personas, assets, worlds, locations, items, world_items, world_lore_entries, chats, actors, chat_participants, characters, actor_memories, actor_notes, actor_items, actor_lore_entries, messages, actor_keys, user_api_keys, generation_attempts, story_turns, quests, quest_progress, world_states, npc_states, location_states, synthetic_data, model_role_overrides |
| 008 | `008_chat_features.ts`             | chat features (partially squashed into 001)                                                                                                                                                                                                                                                                                                                                                               |
| 009 | `009_group_chat.ts`                | group chat features (partially squashed into 001)                                                                                                                                                                                                                                                                                                                                                         |
| 010 | `010_boolean_enums.ts`             | boolean enum conversions (partially squashed into 001)                                                                                                                                                                                                                                                                                                                                                    |
| 011 | `011_memory_decay.ts`              | Memory decay and strength tracking                                                                                                                                                                                                                                                                                                                                                                        |
| 012 | `012_system_config.ts`             | System config key-value table                                                                                                                                                                                                                                                                                                                                                                             |
| 013 | `013_log_entries.ts`               | Log entries table for DB transport                                                                                                                                                                                                                                                                                                                                                                        |
| 014 | `014_plugin_state.ts`              | Plugin state persistence                                                                                                                                                                                                                                                                                                                                                                                  |
| 015 | `015_message_archiving.ts`         | Message archiving column                                                                                                                                                                                                                                                                                                                                                                                  |
| 016 | `016_telemetry_events.ts`          | Telemetry events table                                                                                                                                                                                                                                                                                                                                                                                    |
| 017 | `017_schema_hardening.ts`          | Schema hardening — enum conversions, missing columns                                                                                                                                                                                                                                                                                                                                                      |
| 018 | `018_data_version_columns.ts`      | Data version columns (users, personas, messages) + data_migrations tracking table                                                                                                                                                                                                                                                                                                                         |
| 019 | `019_drop_chat_purpose.ts`         | Drop redundant `chat_purpose` column (canonical is `purpose`, added in 017)                                                                                                                                                                                                                                                                                                                               |
| 020 | `020_difficulty_reroll_default.ts` | Fix worlds.difficulty_reroll default "off" → "none" (match DifficultyReroll enum)                                                                                                                                                                                                                                                                                                                         |

All parts in `001_init.ts` are kept at pre-008 state. Migrations 008-017 add
columns incrementally; migrations 018-020 apply post-hoc fixes.

### Migration Pattern
