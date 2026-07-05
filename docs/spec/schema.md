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

| File | Tables |
|---|---|
| `src/db/migrations/001_init.ts` | DDL for all 27 tables — column types, constraints, defaults, indexes |
| `src/db/schema-core.ts` | Users, Sessions, Chats, Actors, ChatParticipants, Characters, Messages, ActorKeys |
| `src/db/schema-content.ts` | Assets, AssetLinks |
| `src/db/schema-generation.ts` | GenerationAttempts |
| `src/db/schema-story.ts` | Worlds, Locations, Items, WorldItems, StoryTurns, Quests, QuestProgress, WorldStates, NpcStates, LocationStates, ActorMemories, ActorLoreEntries, WorldLoreEntries |
| `src/db/schema-synthetic.ts` | SyntheticData |

Centralized enum definitions: `src/db/enums-*.ts` domain files (core, content, generation, story, config),
re-exported via `src/db/enums.ts` barrel.

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

| Column                              | Values                                                                                                       | What it replaces                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `users.role`                        | `admin`, `user`, `viewer`, `solo`                                                                            | An `is_admin` boolean                                 |
| `messages.visibility`               | `visible`, `hidden_by_user`, `hidden_by_moderator`, `auto_hidden`, `redacted`                                | A `hidden` boolean + separate `hidden_reason` column  |
| `messages.status`                   | `sending`, `confirmed`, `failed`, `partial`, `rejected`, `cancelled`                                         | Message lifecycle state                               |
| `actors.actor_type`                 | `user`, `character`, `narrator`, `system`                                                                    | Polymorphic `(participant_type, participant_id)` pair |
| `actors.agent_type`                 | `none`, `ai`, `narrator`, `npc`                                                                              | An `is_bot` boolean                                   |
| `assets.asset_type`                 | `image`, `audio`, `video`, `memory`, `other`                                                                 | Content type discriminator                            |
| `generation_attempts.status`        | `pending`, `processing`, `streaming`, `completed`, `failed`, `cancelled`                                     | A single `done` boolean                               |
| `generation_attempts.cancel_reason` | `user_cancel`, `repetition_detected`, `policy_mismatch`, `response_limit`, `chat_switch`, `timeout`, `error` | (enum replaces free-text + nullable reason)           |
| `quests.status`                     | `active`, `completed`, `failed`, `abandoned`                                                                 | A `completed` boolean                                 |

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

| #   | File          | Tables |
| --- | ------------- | ------ |
| 001 | `001_init.ts` | All 27 tables: users, sessions, worlds, locations, items, world_items, chats, actors, chat_participants, characters, assets, asset_links, messages, actor_keys, actor_memories, actor_notes, actor_items, actor_lore_entries, world_lore_entries, generation_attempts, story_turns, quests, quest_progress, world_states, npc_states, location_states, synthetic_data |

### Migration Pattern

```typescript
// migrations/NNN_name.ts
import type { Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("table_name")
    .addColumn("id", "text", (col) => col.primaryKey())
    // ...
    .execute();

  await database.schema.createIndex("idx_table_column").on("table_name").column("column_name").execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("table_name").execute();
}
```
