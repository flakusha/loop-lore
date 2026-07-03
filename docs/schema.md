# Database Schema

## Overview

Core tables for loop-lore. Designed for:

- SQLite via `bun:sqlite` (native, default, zero-config)
- [Kysely](https://kysely.dev/) for type-safe queries (layered on bun:sqlite)
- Postgres via Kysely dialect swap when scaling up

## Entity Relationships

```
Users ──1:N── Sessions
Users ──1:N── Actors (as actor_type='user')
Users ──1:N── Characters (as owner)
Users ──M:N── Chats ──1:N── Messages
Actors ──M:N── Chats (via chat_participants)
Actors ──1:N── Messages (single FK replaces user_id + character_id)
Users ──1:N── Assets
Actors ──1:N── Assets (character portraits, etc., via asset_links)
Chats ──1:N── Assets (shared media in chat context)
```

## Key Design Decisions

### No Boolean Flags — Enums Instead

The schema explicitly avoids boolean flags in favor of enum/text columns.
Each enum encodes a state machine rather than a binary on/off:

| Column                      | Values                                                                        | What it replaces                                      |
| --------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| `messages.visibility`       | `visible`, `hidden_by_user`, `hidden_by_moderator`, `auto_hidden`, `redacted` | A `hidden` boolean + separate `hidden_reason` column  |
| `characters.agent_type`     | `none`, `ai`, `narrator`, `npc`                                               | An `is_bot` boolean                                   |
| `actors.actor_type`         | `user`, `character`, `narrator`, `system`                                     | Polymorphic `(participant_type, participant_id)` pair |
| `messages.role`             | `user`, `assistant`, `character`, `system`                                    | (legacy string)                                       |
| `messages.status`           | `sending`, `sent`, `confirmed`, `failed`                                      | (legacy string)                                       |
| `messages.content_encoding` | `identity`, `gzip`, `zstd`, `brotli`                                          | (legacy string)                                       |

### Unified Actor Table

Instead of separate nullable `user_id` and `character_id` foreign keys on `messages`,
and instead of a polymorphic `(participant_type, participant_id)` pair on `chat_participants`,
all participants are unified in the `actors` table:

```sql
actors (id, actor_type, display_name, user_id, owner_id, agent_type, ...)
```

A message has a single `actor_id` FK. A chat participant has a single `actor_id` FK.
The `actor_type` discriminator tells you what kind of actor it is.

## Table: `users`

| Column               | Type | Constraints               | Notes                                               |
| -------------------- | ---- | ------------------------- | --------------------------------------------------- |
| id                   | TEXT | PK, UUID                  |                                                     |
| username             | TEXT | UNIQUE, NOT NULL          | Login name                                          |
| display_name         | TEXT | NOT NULL                  | Shown in UI                                         |
| password_hash        | TEXT |                           | NULL for demo/solo users                            |
| role                 | TEXT | NOT NULL, DEFAULT 'user'  | admin, user, viewer, solo                           |
| settings             | TEXT | DEFAULT '{}'              | JSON blob (prefs, UI config)                        |
| birth_date           | TEXT |                           | ISO date (YYYY-MM-DD). NULL until age gate accepted |
| age_gate_accepted_at | TEXT |                           | ISO timestamp. NULL until age gate accepted         |
| created_at           | TEXT | DEFAULT CURRENT_TIMESTAMP | ISO 8601                                            |
| last_seen_at         | TEXT |                           | ISO 8601                                            |

## Table: `sessions`

| Column        | Type | Constraints               | Notes                            |
| ------------- | ---- | ------------------------- | -------------------------------- |
| id            | TEXT | PK, UUID                  |                                  |
| user_id       | TEXT | FK → users.id, NOT NULL   |                                  |
| token_hash    | TEXT | NOT NULL                  | Server-side hashed session token |
| ip            | TEXT |                           | Client IP                        |
| user_agent    | TEXT |                           | Client UA string                 |
| created_at    | TEXT | DEFAULT CURRENT_TIMESTAMP |                                  |
| last_activity | TEXT | DEFAULT CURRENT_TIMESTAMP |                                  |
| expires_at    | TEXT | NOT NULL                  | Session expiry                   |

- Multiple sessions per user supported (one user on many devices)
- Index: `(user_id)` for lookup, `(token_hash)` for auth

## Table: `chats`

| Column     | Type | Constraints                | Notes                     |
| ---------- | ---- | -------------------------- | ------------------------- |
| id         | TEXT | PK, UUID                   |                           |
| name       | TEXT | NOT NULL                   | Display name              |
| type       | TEXT | NOT NULL, DEFAULT 'direct' | 'direct' (1x1) or 'group' |
| created_by | TEXT | FK → users.id              | Who created the chat      |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP  |                           |
| updated_at | TEXT | DEFAULT CURRENT_TIMESTAMP  | Last message activity     |

## Table: `actors`

Unified participant table. Every entity that can send messages or join chats has an entry here.

| Column          | Type | Constraints               | Notes                                                      |
| --------------- | ---- | ------------------------- | ---------------------------------------------------------- |
| id              | TEXT | PK, UUID                  |                                                            |
| actor_type      | TEXT | NOT NULL, DEFAULT 'user'  | 'user', 'character', 'narrator', 'system'                  |
| display_name    | TEXT | NOT NULL                  | Shown in UI                                                |
| user_id         | TEXT | FK → users.id             | Populated for actor_type='user' (links to auth)            |
| owner_id        | TEXT | FK → users.id             | Populated for actor_type='character' (who created/manages) |
| avatar_asset_id | TEXT | FK → assets.id            | Profile picture                                            |
| description     | TEXT |                           | Long description / backstory                               |
| system_prompt   | TEXT |                           | LLM system prompt override                                 |
| agent_type      | TEXT | NOT NULL, DEFAULT 'none'  | 'none', 'ai', 'narrator', 'npc'                            |
| settings        | TEXT | DEFAULT '{}'              | JSON blob                                                  |
| created_at      | TEXT | DEFAULT CURRENT_TIMESTAMP |                                                            |
| updated_at      | TEXT | DEFAULT CURRENT_TIMESTAMP |                                                            |

- Indexes: `(user_id)` for auth lookup, `(owner_id)` for character management, `(actor_type)` for filtering

## Table: `chat_participants`

Junction: which actors are in which chat. Single FK to `actors` replaces the old polymorphic `(participant_type, participant_id)` pattern.

| Column       | Type | Constraints                | Notes                         |
| ------------ | ---- | -------------------------- | ----------------------------- |
| chat_id      | TEXT | FK → chats.id, NOT NULL    |                               |
| actor_id     | TEXT | FK → actors.id, NOT NULL   |                               |
| role_in_chat | TEXT | NOT NULL, DEFAULT 'member' | 'member', 'owner', 'observer' |
| joined_at    | TEXT | DEFAULT CURRENT_TIMESTAMP  |                               |

- Composite PK: `(chat_id, actor_id)` — an actor can only be in a chat once
- Index: `(actor_id)` for "find all chats for this actor"

## Table: `characters`

Managed AI/NPC characters. For new development, create entries in `actors` with `actor_type='character'` instead.

| Column          | Type | Constraints               | Notes                                                 |
| --------------- | ---- | ------------------------- | ----------------------------------------------------- |
| id              | TEXT | PK, UUID                  |                                                       |
| owner_id        | TEXT | FK → users.id, NOT NULL   | User who created/manages                              |
| name            | TEXT | NOT NULL                  |                                                       |
| avatar_asset_id | TEXT | FK → assets.id            | Profile picture (nullable)                            |
| description     | TEXT |                           | Long description / backstory                          |
| system_prompt   | TEXT |                           | LLM system prompt override                            |
| agent_type      | TEXT | NOT NULL, DEFAULT 'none'  | 'none' (human-played), 'ai' (LLM), 'npc' (non-player) |
| settings        | TEXT | DEFAULT '{}'              | JSON: model prefs, temperature, etc.                  |
| created_at      | TEXT | DEFAULT CURRENT_TIMESTAMP |                                                       |
| updated_at      | TEXT | DEFAULT CURRENT_TIMESTAMP |                                                       |

## Table: `messages`

Ref: [`docs/messages.md`](./messages.md) for full spec.

| Column                 | Type    | Constraints               | Notes                                                                                        |
| ---------------------- | ------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| id                     | TEXT    | PK, UUID                  |                                                                                              |
| chat_id                | TEXT    | FK → chats.id, NOT NULL   |                                                                                              |
| actor_id               | TEXT    | FK → actors.id, NOT NULL  | Unified sender (replaces user_id + character_id)                                             |
| role                   | TEXT    | NOT NULL                  | 'user', 'assistant', 'character', 'system'                                                   |
| content                | TEXT    | NOT NULL                  | Message body                                                                                 |
| content_type           | TEXT    | DEFAULT 'text'            | 'text', 'action', 'narration', 'system'                                                      |
| content_encoding       | TEXT    | DEFAULT 'identity'        | 'identity', 'gzip', 'zstd', 'brotli'                                                         |
| model_id               | TEXT    |                           | LLM model used (NULL for user msgs)                                                          |
| provider               | TEXT    |                           | 'openai', 'anthropic', 'local', etc.                                                         |
| token_count_prompt     | INTEGER |                           |                                                                                              |
| token_count_completion | INTEGER |                           |                                                                                              |
| token_count_total      | INTEGER |                           |                                                                                              |
| token_cost             | REAL    |                           | Estimated USD                                                                                |
| generation_time_ms     | INTEGER |                           |                                                                                              |
| tokens_per_second      | REAL    |                           |                                                                                              |
| status                 | TEXT    | DEFAULT 'sent'            | 'sending', 'sent', 'confirmed', 'failed'                                                     |
| visibility             | TEXT    | DEFAULT 'visible'         | State machine: 'visible', 'hidden_by_user', 'hidden_by_moderator', 'auto_hidden', 'redacted' |
| hidden_by              | TEXT    | FK → actors.id            | Who performed the hide action                                                                |
| hidden_reason          | TEXT    |                           | Free-text or policy reason                                                                   |
| idempotency_key        | TEXT    |                           | For retry dedup                                                                              |
| created_at             | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                                                              |
| edited_at              | TEXT    |                           |                                                                                              |

- Indexes: `(chat_id, created_at)` for message listing, `(idempotency_key)` for dedup, `(actor_id)` for user history

## Table: `assets`

Ref: [`docs/assets.md`](./assets.md) for full spec.

| Column          | Type    | Constraints               | Notes                               |
| --------------- | ------- | ------------------------- | ----------------------------------- |
| id              | TEXT    | PK, UUID                  |                                     |
| owner_id        | TEXT    | FK → users.id, NOT NULL   | Uploader/owner                      |
| filename        | TEXT    | NOT NULL                  | Original filename                   |
| mime_type       | TEXT    | NOT NULL                  | e.g. 'image/png', 'audio/opus'      |
| asset_type      | TEXT    | NOT NULL                  | 'image', 'audio', 'video', 'other'  |
| size_bytes      | INTEGER | NOT NULL                  | File size                           |
| storage_path    | TEXT    | NOT NULL                  | Filesystem path or object store key |
| storage_backend | TEXT    | DEFAULT 'local'           | 'local', 's3', 'gcs'                |
| width           | INTEGER |                           | For images/video                    |
| height          | INTEGER |                           | For images/video                    |
| duration_secs   | REAL    |                           | For audio/video                     |
| alt_text        | TEXT    |                           | Accessibility / description         |
| created_at      | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                     |

## Table: `asset_links`

Junction: which assets are linked to which entities (polymorphic).

| Column      | Type    | Constraints               | Notes                                                      |
| ----------- | ------- | ------------------------- | ---------------------------------------------------------- |
| asset_id    | TEXT    | FK → assets.id, NOT NULL  |                                                            |
| entity_type | TEXT    | NOT NULL                  | 'chat', 'character', 'user', 'world', 'message'            |
| entity_id   | TEXT    | NOT NULL                  | UUID of the linked entity                                  |
| label       | TEXT    |                           | Optional label (e.g. 'avatar', 'portrait', 'bgm', 'scene') |
| sort_order  | INTEGER | DEFAULT 0                 | Display ordering                                           |
| created_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                            |

- Composite PK: `(asset_id, entity_type, entity_id)`
- This replaces the old `gallery` table — polymorphic linking covers all use cases

## Table: `worlds`

| Column      | Type | Constraints               | Notes                       |
| ----------- | ---- | ------------------------- | --------------------------- |
| id          | TEXT | PK, UUID                  |                             |
| owner_id    | TEXT | FK → users.id, NOT NULL   |                             |
| name        | TEXT | NOT NULL                  |                             |
| description | TEXT |                           |                             |
| lore        | TEXT |                           | World lore / knowledge base |
| created_at  | TEXT | DEFAULT CURRENT_TIMESTAMP |                             |
| updated_at  | TEXT | DEFAULT CURRENT_TIMESTAMP |                             |

- Worlds link to chats and characters via `asset_links` with entity_type='world'

## Migration Strategy

Single `src/db/migrations/` directory with Kysely Migrator files.
Run via `src/db/migrate.ts` using `Migrator` from Kysely.

```typescript
// migrations/001_init.ts
import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("actors")
    .addColumn("id", "text", (col) => col.primaryKey())
    // ...
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("actors").execute();
}
```
