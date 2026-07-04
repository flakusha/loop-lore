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

Actors ──M:N── Chats (via chat_participants)
Actors ──1:N── Messages (single FK replaces user_id + character_id)
Actors ──1:N── Assets (character portraits, etc., via asset_links)
Actors ──1:N── NpcStates (dynamic NPC state per world)
Actors ──1:N── GenerationAttempts

Chats ──1:N── Messages
Chats ──1:N── Assets (shared media in chat context)
Chats ──1:N── GenerationAttempts
Chats ──1:N── StoryTurns
Chats ──1:N── QuestProgress
Chats ──1:N── SyntheticData
Chats ──M:N── Worlds (via asset_links with entity_type='world')

Worlds ──1:N── Items (world-level item definitions)
Worlds ──1:N── Locations
Worlds ──1:N── Quests
Worlds ──1:N── WorldStates (snapshots)
Worlds ──1:N── NpcStates
Worlds ──1:N── LocationStates
Worlds ──1:N── SyntheticData

Items ──1:N── WorldItems (item instances in locations / carried by NPCs)

Messages ──1:N── Messages (via parent_id — tree model)
Messages ──1:N── GenerationAttempts (via parent_message_id)

GenerationAttempts ──1:N── GenerationAttempts (via parent_attempt_id — continuation chains)
```

## Key Design Decisions

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
| `generation_attempts.status`        | `pending`, `processing`, `streaming`, `completed`, `failed`, `cancelled`                                     | A single `done` boolean                               |
| `generation_attempts.cancel_reason` | `user_cancel`, `repetition_detected`, `policy_mismatch`, `response_limit`, `chat_switch`, `timeout`, `error` | (enum replaces free-text + nullable reason)           |
| `quests.status`                     | `active`, `completed`, `failed`, `abandoned`                                                                 | A `completed` boolean                                 |

### Unified Actor Table

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
See `src/db/enums-core.ts`, `src/db/enums-content.ts`, `src/db/enums-generation.ts`, `src/db/enums-story.ts`, `src/db/enums-config.ts` for the complete lists.

---

## Table: `users`

| Column               | Type | Constraints               | Notes                                               |
| -------------------- | ---- | ------------------------- | --------------------------------------------------- |
| id                   | TEXT | PK, UUID                  |                                                     |
| username             | TEXT | UNIQUE, NOT NULL          | Login name                                          |
| display_name         | TEXT | NOT NULL                  | Shown in UI                                         |
| password_hash        | TEXT |                           | NULL for demo/solo users                            |
| role                 | TEXT | NOT NULL, DEFAULT 'user'  | 'admin', 'user', 'viewer', 'solo'                   |
| status               | TEXT | NOT NULL, DEFAULT 'active'| 'active', 'disabled', 'deactivated'                 |
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

| Column              | Type    | Constraints                | Notes                                                                |
| ------------------- | ------- | -------------------------- | -------------------------------------------------------------------- |
| id                  | TEXT    | PK, UUID                   |                                                                      |
| name                | TEXT    | NOT NULL                   | Display name                                                         |
| type                | TEXT    | NOT NULL, DEFAULT 'direct' | 'direct', 'group'                                                    |
| mode                | TEXT    | NOT NULL, DEFAULT 'direct' | 'direct', 'group', 'story' (extends `type`)                          |
| created_by          | TEXT    | FK → users.id, NOT NULL    | Who created the chat                                                 |
| world_id            | TEXT    | FK → worlds.id             | Linked world (for story mode)                                        |
| current_location_id | TEXT    | FK → locations.id          | Current scene location (story mode)                                  |
| story_state         | TEXT    |                            | JSON — TurnManager serialized state                                  |
| gm_config           | TEXT    |                            | JSON — Game Master configuration                                     |
| turn_strategy       | TEXT    |                            | 'round_robin', 'scene_based', 'initiative', 'quest_driven', 'hybrid' |
| max_turns           | INTEGER |                            | Max turns for story mode                                             |
| auto_advance        | INTEGER |                            | Boolean — auto-advance story turns                                   |
| created_at          | TEXT    | DEFAULT CURRENT_TIMESTAMP  |                                                                      |
| updated_at          | TEXT    | DEFAULT CURRENT_TIMESTAMP  | Last message activity                                                |

- `mode` extends `type`: a chat can be `type='direct', mode='story'`
- Indexes: `(world_id)`, `(current_location_id)`

## Table: `actors`

Unified participant table. Every entity that can send messages or join chats has an entry here.
See [actors.md](./actors.md) for full character-card import fields, memories, lorebooks, and items.

| Column                    | Type    | Constraints               | Notes                                                      |
| ------------------------- | ------- | ------------------------- | ---------------------------------------------------------- |
| id                        | TEXT    | PK, UUID                  |                                                            |
| actor_type                | TEXT    | NOT NULL, DEFAULT 'user'  | 'user', 'character', 'narrator', 'system'                  |
| display_name              | TEXT    | NOT NULL                  | Shown in UI                                                |
| user_id                   | TEXT    | FK → users.id             | Populated for actor_type='user' (links to auth)            |
| owner_id                  | TEXT    | FK → users.id             | Populated for actor_type='character' (who created/manages) |
| avatar_asset_id           | TEXT    | FK → assets.id            | Profile picture                                            |
| description               | TEXT    |                           | Long description / backstory                               |
| system_prompt             | TEXT    |                           | LLM system prompt override                                 |
| agent_type                | TEXT    | NOT NULL, DEFAULT 'none'  | 'none', 'ai', 'narrator', 'npc'                            |
| settings                  | TEXT    | DEFAULT '{}'              | JSON blob (model prefs, tool config, etc.)                 |
| created_at                | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                            |
| updated_at                | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                            |

- Indexes: `(user_id)` for auth lookup, `(owner_id)` for character management, `(actor_type)` for filtering

## Table: `chat_participants`

Junction: which actors are in which chat. Single FK to `actors` replaces the old
polymorphic `(participant_type, participant_id)` pattern.

| Column       | Type | Constraints                | Notes                         |
| ------------ | ---- | -------------------------- | ----------------------------- |
| chat_id      | TEXT | FK → chats.id, NOT NULL    |                               |
| actor_id     | TEXT | FK → actors.id, NOT NULL   |                               |
| role_in_chat | TEXT | NOT NULL, DEFAULT 'member' | 'member', 'owner', 'observer' |
| joined_at    | TEXT | DEFAULT CURRENT_TIMESTAMP  |                               |

- Composite PK: `(chat_id, actor_id)` — an actor can only be in a chat once
- Index: `(actor_id)` for "find all chats for this actor"

## Table: `characters`

Managed AI/NPC characters. For new development, create entries in `actors` with
`actor_type='character'` instead. This table remains for backward compat.

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

## Table: `actor_keys`

Encryption keys for actors. Each actor has a primary key, and may have additional keys for rotation or compartmentalization.

| Column        | Type | Constraints               | Notes                                            |
| ------------- | ---- | ------------------------- | ------------------------------------------------ |
| id            | TEXT | PK, UUID                  |                                                  |
| actor_id      | TEXT | FK → actors.id, NOT NULL  | Owner of this key                                |
| name          | TEXT | NOT NULL                  | Key name (e.g., 'primary', 'rotation-2024-01')   |
| key_type      | TEXT | NOT NULL                  | 'primary', 'additional'                          |
| encrypted_key | TEXT |                           | SMK-encrypted key (NULL for client-derived keys) |
| public_key    | TEXT |                           | For key exchange (future)                        |
| created_at    | TEXT | DEFAULT CURRENT_TIMESTAMP |                                                  |
| expires_at    | TEXT |                           | For key rotation                                 |
| status        | TEXT | DEFAULT 'active'          | 'active', 'expired', 'revoked'                   |

- Indexes: `(actor_id)`, `(status)`

## Table: `messages`

Ref: [`docs/messages.md`](./messages.md) for full spec. Ref: [`docs/frontend/chat/messages.md`](./frontend/chat/messages.md) for UI spec.

| Column                 | Type    | Constraints               | Notes                                                                                        |
| ---------------------- | ------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| id                     | TEXT    | PK, UUID                  |                                                                                              |
| chat_id                | TEXT    | FK → chats.id, NOT NULL   |                                                                                              |
| actor_id               | TEXT    | FK → actors.id, NOT NULL  | Unified sender (replaces user_id + character_id)                                             |
| parent_id              | TEXT    | FK → messages.id          | Parent in message tree (NULL = root)                                                         |
| role                   | TEXT    | NOT NULL                  | 'user', 'assistant', 'character', 'system'                                                   |
| content                | TEXT    | NOT NULL                  | Message body (encrypted JSON with key reference)                                             |
| key_id                 | TEXT    | FK → actor_keys.id        | Which key encrypted this message                                                             |
| content_format         | TEXT    | DEFAULT 'markdown'        | 'markdown', 'text', 'json', 'html'                                                           |
| content_type           | TEXT    | DEFAULT 'text'            | 'text', 'action', 'narration', 'system', 'continuation'                                      |
| content_encoding       | TEXT    | DEFAULT 'identity'        | 'identity', 'gzip', 'zstd', 'brotli'                                                         |
| continuation_index     | INTEGER |                           | Set if message is continuation of a partial; NULL otherwise                                   |
| model_id               | TEXT    |                           | LLM model used (NULL for user msgs)                                                          |
| provider               | TEXT    |                           | 'openai', 'anthropic', 'local', etc.                                                         |
| token_count_prompt     | INTEGER |                           |                                                                                              |
| token_count_completion | INTEGER |                           |                                                                                              |
| token_count_total      | INTEGER |                           |                                                                                              |
| token_cost             | REAL    |                           | Estimated USD                                                                                |
| generation_time_ms     | INTEGER |                           |                                                                                              |
| tokens_per_second      | REAL    |                           |                                                                                              |
| status                 | TEXT    | DEFAULT 'sending'         | 'sending', 'confirmed', 'failed', 'partial', 'rejected', 'cancelled'                          |
| visibility             | TEXT    | DEFAULT 'visible'         | State machine: 'visible', 'hidden_by_user', 'hidden_by_moderator', 'auto_hidden', 'redacted' |
| hidden_by              | TEXT    | FK → actors.id            | Who performed the hide action                                                                |
| hidden_reason          | TEXT    |                           | Free-text or policy reason                                                                   |
| idempotency_key        | TEXT    |                           | For retry dedup                                                                              |
| created_at             | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                                                              |
| edited_at              | TEXT    |                           |                                                                                              |

- Indexes: `(chat_id, created_at)` for message listing, `(idempotency_key)` for dedup,
  `(actor_id)` for user history, `(parent_id)` for tree traversal,
  `(key_id)` for key-based queries, `(content_format)` for format filtering

### Message Tree Model

```
Message A (root, parent_id = NULL)
├── Message B (reply to A, parent_id = A.id)
│   ├── Message B1 (continuation of B, continuation_index=1)
│   │   └── Message B2 (multi-continue, continuation_index=2)
│   └── [swipe] Message C (alternative to B, same parent_id)
└── Message D (reply to A)
```

- **Active path**: the chain from root to the latest visible leaf, picking the
  active swipe variant at each fork
- **Swipe variants**: share the same `parent_id` — they are siblings, not children
- **Continuations**: `continuation_index` set, parented to the partial message they extend

## Table: `generation_attempts`

Tracks every LLM generation attempt for idempotency, cancellation, retry, and analytics.
Also supports continuation chains and multi-step pipelines.

| Column                    | Type    | Constraints                         | Notes                                                                                                        |
| ------------------------- | ------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| id                        | TEXT    | PK, UUID                            |                                                                                                              |
| chat_id                   | TEXT    | FK → chats.id, NOT NULL             |                                                                                                              |
| parent_message_id         | TEXT    | FK → messages.id, NOT NULL          | User message that triggered generation                                                                       |
| actor_id                  | TEXT    | FK → actors.id, NOT NULL            | AI actor generating the response                                                                             |
| idempotency_key           | TEXT    | NOT NULL                            | For deduplication                                                                                            |
| model_id                  | TEXT    | NOT NULL                            | LLM model used                                                                                               |
| provider                  | TEXT    | NOT NULL                            | 'openai', 'anthropic', 'local', etc.                                                                         |
| status                    | TEXT    | NOT NULL, DEFAULT 'pending'         | 'pending', 'processing', 'streaming', 'completed', 'failed', 'cancelled'                                     |
| cancel_reason             | TEXT    |                                     | 'user_cancel', 'repetition_detected', 'policy_mismatch', 'response_limit', 'chat_switch', 'timeout', 'error' |
| cancel_reason_detail      | TEXT    |                                     | Human-readable detail                                                                                        |
| cancel_source             | TEXT    |                                     | 'user', 'auto_repetition', 'auto_policy', 'auto_limit', 'chat_switch', 'system'                              |
| abort_signal_id           | TEXT    |                                     | UUID for AbortController coordination                                                                        |
| started_at                | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                                                                              |
| completed_at              | TEXT    |                                     |                                                                                                              |
| prompt_tokens             | INTEGER |                                     |                                                                                                              |
| completion_tokens         | INTEGER |                                     |                                                                                                              |
| total_tokens              | INTEGER |                                     |                                                                                                              |
| generation_time_ms        | INTEGER |                                     |                                                                                                              |
| error_message             | TEXT    |                                     |                                                                                                              |
| streaming_chunks_received | INTEGER |                                     |                                                                                                              |
| streaming_chars_received  | INTEGER |                                     |                                                                                                              |
| repetition_score          | REAL    |                                     | 0-1 score for repetition detection                                                                           |
| repetition_analysis       | TEXT    |                                     | JSON with repetition details                                                                                 |
| policy_analysis           | TEXT    |                                     | JSON with policy analysis details                                                                            |
| response_count_in_turn    | INTEGER |                                     | For group chat response limits                                                                               |
| parent_attempt_id         | TEXT    | FK → generation_attempts.id         | For continuation chains                                                                                      |
| continuation_count        | INTEGER |                                     | Which continuation number (1-based)                                                                          |
| partial_content           | TEXT    |                                     | Captured partial content for Continue feature                                                                |
| step_index                | INTEGER | DEFAULT 0                           | Current step in multi-step pipeline                                                                          |
| total_steps               | INTEGER | DEFAULT 1                           | Total steps in multi-step pipeline                                                                           |
| created_at                | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                                                                              |
| updated_at                | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                                                                              |

- Indexes: `(chat_id)`, `(parent_message_id)`, `(actor_id)`, `(idempotency_key)`,
  `(status)`, `(abort_signal_id)`, `(parent_attempt_id)`

**Status lifecycle**: `pending → processing → streaming → completed`
Each of `pending`, `processing`, `streaming` can transition to `failed` or `cancelled`.

**TTL cleanup**: Entries older than 1 hour eligible for garbage collection. Cleaned by:
1. **Lazy cleanup**: On new generation attempt, server sweeps expired entries for the same chat_id
2. **Periodic sweep**: Background timer runs every 15 minutes, `DELETE FROM generation_attempts WHERE updated_at < datetime('now', '-1 hour') AND status IN ('completed', 'failed', 'cancelled')`
3. **On server startup**: Full sweep of expired entries
Active generation attempts (`pending`, `processing`, `streaming`) are never swept — they must transition to terminal state or be explicitly cancelled.

**Chat-switch guard**: When generation starts, `generation_attempts.chat_id` is set to the originating chat.
If the user navigates to a different chat while generation is active, the response is still
delivered to the original `chat_id`. The frontend displays the response in the correct chat context.
When the user returns to the original chat, the response is visible. This is enforced by:
1. Generation controller reads `chat_id` from the attempt, not from the current request context
2. Message insert uses `generation_attempts.chat_id` as target
3. Frontend uses `CancelReason.ChatSwitch` when navigating away mid-gen (does not cancel — only cancels if user explicitly requests it)

## Table: `assets`

Ref: [`docs/assets.md`](./assets.md) for full spec.

| Column          | Type    | Constraints               | Notes                                                    |
| --------------- | ------- | ------------------------- | -------------------------------------------------------- |
| id              | TEXT    | PK, UUID                  |                                                          |
| owner_id        | TEXT    | FK → users.id, NOT NULL   | Uploader/owner                                           |
| filename        | TEXT    | NOT NULL                  | Original filename                                        |
| mime_type       | TEXT    | NOT NULL                  | e.g. 'image/png', 'audio/opus'                           |
| asset_type      | TEXT    | NOT NULL                  | 'image', 'audio', 'video', 'other' (+ artifact subtypes) |
| size_bytes      | INTEGER | NOT NULL                  | File size                                                |
| storage_path    | TEXT    | NOT NULL                  | Filesystem path or object store key                      |
| storage_backend | TEXT    | DEFAULT 'local'           | 'local', 's3', 'gcs'                                     |
| width           | INTEGER |                           | For images/video                                         |
| height          | INTEGER |                           | For images/video                                         |
| duration_secs   | REAL    |                           | For audio/video                                          |
| alt_text        | TEXT    |                           | Accessibility / description                              |
| created_at      | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                          |

## Table: `asset_links`

Junction: which assets are linked to which entities (polymorphic).

| Column      | Type    | Constraints               | Notes                                                                |
| ----------- | ------- | ------------------------- | -------------------------------------------------------------------- |
| asset_id    | TEXT    | FK → assets.id, NOT NULL  |                                                                      |
| entity_type | TEXT    | NOT NULL                  | 'chat', 'character', 'user', 'world', 'message', 'actor_item'        |
| entity_id   | TEXT    | NOT NULL                  | UUID of the linked entity                                            |
| label       | TEXT    |                           | Optional label (e.g. 'avatar', 'portrait', 'bgm', 'scene', 'memory') |
| sort_order  | INTEGER | DEFAULT 0                 | Display ordering                                                     |
| created_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                                      |

- Composite PK: `(asset_id, entity_type, entity_id)`
- This replaces the old `gallery` table — polymorphic linking covers all use cases

## Table: `worlds`

Ref: [`docs/frontend/worlds.md`](./frontend/worlds.md) for UI spec.

| Column       | Type    | Constraints               | Notes                      |
| ------------ | ------- | ------------------------- | -------------------------- |
| id           | TEXT    | PK, UUID                  |                            |
| owner_id     | TEXT    | FK → users.id, NOT NULL   |                            |
| name         | TEXT    | NOT NULL                  |                            |
| description  | TEXT    |                           |                            |
| lore         | TEXT    |                           | World lore / knowledge base |
| created_at   | TEXT    | DEFAULT CURRENT_TIMESTAMP |                            |
| updated_at   | TEXT    | DEFAULT CURRENT_TIMESTAMP |                            |

- Worlds link to chats and characters via `asset_links` with entity_type='world'

## Table: `items`

World-level item definitions (templates for items that can appear in the world).

| Column      | Type    | Constraints               | Notes                                                        |
| ----------- | ------- | ------------------------- | ------------------------------------------------------------ |
| id          | TEXT    | PK, UUID                  |                                                              |
| world_id    | TEXT    | FK → worlds.id, NOT NULL  | Parent world                                                 |
| name        | TEXT    | NOT NULL                  | Item name                                                    |
| description | TEXT    |                           |                                                              |
| category    | TEXT    | NOT NULL                  | Item category (e.g., 'weapon', 'consumable', 'key_item')     |
| rarity      | TEXT    | NOT NULL, DEFAULT 'common' | 'common', 'uncommon', 'rare', 'legendary'                    |
| stackable   | INTEGER | NOT NULL, DEFAULT 0       | Boolean                                                      |
| max_stack   | INTEGER | NOT NULL, DEFAULT 1       | Max stack size                                               |
| properties  | TEXT    | NOT NULL, DEFAULT '{}'    | JSON — type-specific properties                              |
| value       | INTEGER | NOT NULL, DEFAULT 0       | Monetary base value                                          |
| weight      | REAL    | NOT NULL, DEFAULT 0       | Encumbrance units                                            |
| created_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                              |
| updated_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                                              |

Indexes: `(world_id)`, `(category)`

## Table: `world_items`

Item instances placed in locations or carried by NPCs within a world.

| Column           | Type    | Constraints               | Notes                                         |
| ---------------- | ------- | ------------------------- | --------------------------------------------- |
| id               | TEXT    | PK, UUID                  |                                               |
| world_id         | TEXT    | FK → worlds.id, NOT NULL  |                                               |
| item_id          | TEXT    | FK → items.id, NOT NULL   | Link to item definition                       |
| location_id      | TEXT    | FK → locations.id         | Where the item is (null if carried)           |
| owner_actor_id   | TEXT    | FK → actors.id            | Who carries it (null if in location)          |
| quantity         | INTEGER | NOT NULL, DEFAULT 1       | Stack count                                   |
| visibility       | TEXT    | NOT NULL, DEFAULT 'visible' | 'visible', 'hidden'                           |
| spawn_condition  | TEXT    |                           | Condition for appearing                       |
| respawnable      | INTEGER | NOT NULL, DEFAULT 0       | Boolean — respawns after being taken          |
| created_at       | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                               |
| updated_at       | TEXT    | DEFAULT CURRENT_TIMESTAMP |                                               |

Indexes: `(world_id)`, `(location_id)`, `(owner_actor_id)`, `(item_id)`

---

## Story Feature Tables

The tables below support the multi-LLM story generation system (see
[`docs/frontend/chat/multi-llm-story.md`](./frontend/chat/multi-llm-story.md)).

### `locations`

Sub-entities of worlds — represent scenes, rooms, or regions.

| Column             | Type | Constraints               | Notes                                                 |
| ------------------ | ---- | ------------------------- | ----------------------------------------------------- |
| id                 | TEXT | PK, UUID                  |                                                       |
| world_id           | TEXT | FK → worlds.id, NOT NULL  | Parent world                                          |
| name               | TEXT | NOT NULL                  | Location name                                         |
| description        | TEXT |                           |                                                       |
| connections        | TEXT | NOT NULL, DEFAULT '[]'    | JSON array of `{location_id, direction, description}` |
| parent_location_id | TEXT | FK → locations.id         | Nested location (contained within another)            |
| created_at         | TEXT | DEFAULT CURRENT_TIMESTAMP |                                                       |
| updated_at         | TEXT | DEFAULT CURRENT_TIMESTAMP |                                                       |

- Indexes: `(world_id)`, `(parent_location_id)`

### `story_turns`

Individual turns in a story-generation session.

| Column             | Type    | Constraints                         | Notes                                                                                    |
| ------------------ | ------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| id                 | TEXT    | PK, UUID                            |                                                                                          |
| chat_id            | TEXT    | FK → chats.id, NOT NULL             |                                                                                          |
| turn_number        | INTEGER | NOT NULL                            | Sequential within chat                                                                   |
| actor_id           | TEXT    | FK → actors.id, NOT NULL            | Actor who generated this turn                                                            |
| turn_type          | TEXT    | NOT NULL                            | 'character_action', 'narration', 'gm_injection', 'quest_update', 'world_event'           |
| prompt_sent        | TEXT    | NOT NULL                            | Prompt sent to the actor's LLM                                                           |
| response_received  | TEXT    |                                     | Actor's response content                                                                 |
| quality_score      | REAL    |                                     | 0-100 quality evaluation score                                                           |
| quality_details    | TEXT    |                                     | JSON — per-dimension scores + reasoning                                                  |
| regeneration_count | INTEGER | NOT NULL, DEFAULT 0                 | Number of regeneration attempts                                                          |
| status             | TEXT    | NOT NULL, DEFAULT 'pending'         | 'pending', 'generating', 'evaluating', 'accepted', 'regenerating', 'failed', 'escalated' |
| gm_decision        | TEXT    |                                     | JSON — Game Master's decision for this turn                                              |
| world_events       | TEXT    | NOT NULL, DEFAULT '[]'              | JSON array of WorldEvent extracted from response                                         |
| quest_progress     | TEXT    | NOT NULL, DEFAULT '[]'              | JSON array of quest progress updates                                                     |
| started_at         | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                                                          |
| completed_at       | TEXT    |                                     |                                                                                          |
| created_at         | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                                                          |
| updated_at         | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                                                          |

- Indexes: `(chat_id)`, `(chat_id, turn_number)`, `(actor_id)`

### `quests`

Global quests defined at the world level.

| Column           | Type    | Constraints                         | Notes                                                                             |
| ---------------- | ------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| id               | TEXT    | PK, UUID                            |                                                                                   |
| world_id         | TEXT    | FK → worlds.id, NOT NULL            |                                                                                   |
| creator_id       | TEXT    | FK → actors.id, NOT NULL            | GM or system that created the quest                                               |
| name             | TEXT    | NOT NULL                            |                                                                                   |
| description      | TEXT    |                                     |                                                                                   |
| type             | TEXT    | NOT NULL                            | 'time', 'collection', 'destruction', 'rescue', 'discovery', 'social', 'composite' |
| status           | TEXT    | NOT NULL, DEFAULT 'active'          | 'active', 'completed', 'failed', 'abandoned'                                      |
| priority         | INTEGER | NOT NULL, DEFAULT 0                 | Higher = more urgent for GM attention                                             |
| config           | TEXT    | NOT NULL, DEFAULT '{}'              | JSON — type-specific configuration (see types in multi-llm-story.md)              |
| progress         | INTEGER | NOT NULL, DEFAULT 0                 | 0-100 or absolute count                                                           |
| target           | INTEGER | NOT NULL                            | Target value for completion                                                       |
| start_time       | TEXT    |                                     | ISO timestamp                                                                     |
| deadline         | TEXT    |                                     | ISO timestamp (null = no deadline)                                                |
| time_location_id | TEXT    | FK → locations.id                   | Location whose time tracks (for time-based quests)                                |
| rewards          | TEXT    | NOT NULL, DEFAULT '{}'              | JSON — XP, items, world changes, lore unlocks                                     |
| narrative_hooks  | TEXT    | NOT NULL, DEFAULT '[]'              | JSON array — story beats at progress milestones                                   |
| created_at       | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                                                   |
| updated_at       | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                                                   |
| completed_at     | TEXT    |                                     |                                                                                   |

- Indexes: `(world_id)`, `(status)`, `(creator_id)`

### `quest_progress`

Per-chat progress tracking for quests (a quest can have different progress in different chat sessions).

| Column             | Type    | Constraints                         | Notes                                            |
| ------------------ | ------- | ----------------------------------- | ------------------------------------------------ |
| id                 | TEXT    | PK, UUID                            |                                                  |
| quest_id           | TEXT    | FK → quests.id, NOT NULL            |                                                  |
| chat_id            | TEXT    | FK → chats.id, NOT NULL             |                                                  |
| progress           | INTEGER | NOT NULL, DEFAULT 0                 | Current progress value                           |
| status             | TEXT    | NOT NULL, DEFAULT 'active'          | 'active', 'completed', 'failed', 'ignored'       |
| contributed_events | TEXT    | NOT NULL, DEFAULT '[]'              | JSON array of event IDs that advanced this quest |
| started_at         | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                  |
| updated_at         | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                  |
| completed_at       | TEXT    |                                     |                                                  |

- Indexes: `(quest_id)`, `(chat_id)`, `(quest_id, chat_id)`

### `world_states`

Point-in-time snapshots of world state for rollback and history.

| Column             | Type | Constraints                         | Notes                                |
| ------------------ | ---- | ----------------------------------- | ------------------------------------ |
| id                 | TEXT | PK, UUID                            |                                      |
| world_id           | TEXT | FK → worlds.id, NOT NULL            |                                      |
| snapshot           | TEXT | NOT NULL                            | JSON — full serialized state         |
| trigger_message_id | TEXT | FK → messages.id                    | Message that triggered this snapshot |
| trigger_turn_id    | TEXT | FK → story_turns.id                 | Turn that triggered this snapshot    |
| description        | TEXT |                                     | Human-readable label                 |
| created_at         | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                      |

- Index: `(world_id)`

### `npc_states`

Dynamic state for NPCs within a world (separate from static actor definition).

| Column        | Type    | Constraints                         | Notes                                         |
| ------------- | ------- | ----------------------------------- | --------------------------------------------- |
| id            | TEXT    | PK, UUID                            |                                               |
| actor_id      | TEXT    | FK → actors.id, NOT NULL            |                                               |
| world_id      | TEXT    | FK → worlds.id, NOT NULL            |                                               |
| location_id   | TEXT    | FK → locations.id                   | Current location                              |
| health        | INTEGER | NOT NULL, DEFAULT 100               |                                               |
| mental_state  | TEXT    | NOT NULL, DEFAULT 'calm'            | 'calm', 'afraid', 'angry', 'suspicious', etc. |
| knowledge     | TEXT    | NOT NULL, DEFAULT '{}'              | JSON — `{fact: {fact, confidence, source}}`   |
| relationships | TEXT    | NOT NULL, DEFAULT '{}'              | JSON — `{actor_id: disposition(-100..100)}`   |
| inventory     | TEXT    | NOT NULL, DEFAULT '[]'              | JSON array of item IDs                        |
| schedule      | TEXT    | NOT NULL, DEFAULT '{}'              | JSON — time-based behavior patterns           |
| created_at    | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                               |
| updated_at    | TEXT    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                               |

- Indexes: `(actor_id)`, `(world_id)`, `(location_id)`

### `location_states`

Dynamic state for locations within a world.

| Column               | Type | Constraints                         | Notes                                            |
| -------------------- | ---- | ----------------------------------- | ------------------------------------------------ |
| id                   | TEXT | PK, UUID                            |                                                  |
| location_id          | TEXT | FK → locations.id, NOT NULL         |                                                  |
| world_id             | TEXT | FK → worlds.id, NOT NULL            |                                                  |
| description_override | TEXT |                                     | Temporary description change                     |
| atmosphere           | TEXT |                                     | Current mood: 'tense', 'peaceful', 'eerie', etc. |
| npcs_present         | TEXT | NOT NULL, DEFAULT '[]'              | JSON array of actor IDs currently here           |
| items_available      | TEXT | NOT NULL, DEFAULT '[]'              | JSON array of item IDs findable here             |
| time_of_day          | TEXT |                                     | 'morning', 'afternoon', 'evening', 'night'       |
| weather              | TEXT |                                     | 'clear', 'rain', 'storm', 'fog'                  |
| hazards              | TEXT | NOT NULL, DEFAULT '[]'              | JSON array of active environmental hazards       |
| updated_at           | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                  |

- Indexes: `(location_id)`, `(world_id)`

### `synthetic_data`

Generated test scenarios from story sessions for automated testing.

| Column          | Type | Constraints                         | Notes                                                                                                                      |
| --------------- | ---- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| id              | TEXT | PK, UUID                            |                                                                                                                            |
| chat_id         | TEXT | FK → chats.id                       | Source session                                                                                                             |
| world_id        | TEXT | FK → worlds.id                      |                                                                                                                            |
| type            | TEXT | NOT NULL                            | 'turn_sequence', 'quality_evaluation', 'quest_progression', 'world_state_transition', 'regeneration_case', 'gm_escalation' |
| source_data     | TEXT | NOT NULL                            | JSON — input context                                                                                                       |
| generated_cases | TEXT | NOT NULL                            | JSON — expected outputs                                                                                                    |
| metadata        | TEXT | NOT NULL, DEFAULT '{}'              | JSON — turn numbers, actor IDs, scores                                                                                     |
| status          | TEXT | NOT NULL, DEFAULT 'generated'       | 'generated', 'validated', 'approved', 'rejected', 'archived'                                                               |
| created_at      | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP |                                                                                                                            |
| validated_at    | TEXT |                                     |                                                                                                                            |
| validated_by    | TEXT | FK → actors.id                      |                                                                                                                            |

- Indexes: `(chat_id)`, `(world_id)`, `(type)`, `(status)`

---

## Planned Tables (Not Yet in Migration)

These are described in the actor spec ([actors.md](./actors.md)) but not yet
created in the migration. They will be added in a future migration:

- `actor_memories` — accumulated facts learned across conversations
- `actor_notes` — freeform user-authored notes attached to an actor
- `actor_lore_entries` — character-specific lorebook entries (character_book)
- `world_lore_entries` — world-scoped lore entries (same structure)
- `actor_items` — equipment, possessions, quest items

See [`docs/actors.md`](./actors.md) for the full table definitions.

---

## Migration Strategy

Migrations are managed by Kysely Migrator and stored in `src/db/migrations/`.
Run via `src/db/migrate.ts`.

For the current active-development phase (no production data), migrations are
linear with `up()`/`down()` exports. When the schema stabilises, the migration
chain can be squashed into a single `001_init.ts` that creates all tables at once.

### Current Migration Sequence

| #   | File          | What it creates                                                                                                                                                                                                                                                                                            |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | `001_init.ts` | All 22 tables: users, sessions, worlds, locations, items, world_items, chats, actors, chat_participants, characters, assets, asset_links, messages, actor_keys, generation_attempts, story_turns, quests, quest_progress, world_states, npc_states, location_states, synthetic_data |

### Migration Notes

All tables and columns are defined in a single `001_init.ts` migration for the v0 development phase. This simplifies the database setup and allows for easy iteration during early development. When production data exists, migrations would be split into logical groups.

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
