---
name: loop-lore-db
description: >
  Use when working with loop-lore database layer. Covers schema layout, table
  types, enums, migration patterns, Kysely conventions, and common queries.
version: 1.0.0
author: loop-lore contributors
license: Apache-2.0 OR MIT
metadata:
  agents:
    tags: [loop-lore, database, kysely, schema, migrations, bun-sqlite]
    related_skills: [loop-lore-context, loop-lore-tasks]
---

# Loop-Lore Database Layer

## Architecture

- **`bun:sqlite`** native (no `better-sqlite3`, no custom adapter)
- **Kysely** with `kysely/bun-sqlite` dialect for type-safe queries
- **Kysely PostgresDialect** for PG swap (same schema types, different dialect)
- Schema defined in `src/db/schema*.ts` as TypeScript interfaces
- Enum types in `src/db/enums*.ts` as `const` objects + type unions
- Migrations in `src/db/migrations/`, run via Kysely Migrator

## File Layout

```
src/db/
├── index.ts              Kysely init, DB instance export
├── schema.ts             Barrel → re-exports domain schemas + DB aggregate type
├── schema-core.ts        Core: users, sessions, actors, chats, messages, characters
├── schema-content.ts     Content: assets, asset_links
├── schema-generation.ts  Generation: generation_attempts
├── schema-story.ts       Story: worlds, locations, story_turns, quests, npc_states, items
├── schema-synthetic.ts   Synthetic: synthetic_data exports
├── enums.ts              Barrel → re-exports domain enums
├── enums-core.ts         Core enums
├── enums-content.ts      Content enums
├── enums-generation.ts   Generation enums
├── enums-story.ts        Story enums
├── enums-config.ts       Config enums
├── migrate.ts            Migration runner script
└── migrations/           Chronological migration files
```

## Table Registry (DB aggregate type)

From `schema.ts`:

| Table                  | Schema Source         | Domain     |
| ---------------------- | --------------------- | ---------- |
| `users`                | `schema-core.ts`      | Core       |
| `sessions`             | `schema-core.ts`      | Core       |
| `chats`                | `schema-core.ts`      | Core       |
| `actors`               | `schema-core.ts`      | Core       |
| `chat_participants`    | `schema-core.ts`      | Core       |
| `characters`           | `schema-core.ts`      | Core       |
| `messages`             | `schema-core.ts`      | Core       |
| `assets`               | `schema-content.ts`   | Content    |
| `asset_links`          | `schema-content.ts`   | Content    |
| `worlds`               | `schema-story.ts`     | Story      |
| `locations`            | `schema-story.ts`     | Story      |
| `generation_attempts`  | `schema-generation.ts`| Generation |
| `story_turns`          | `schema-story.ts`     | Story      |
| `quests`               | `schema-story.ts`     | Story      |
| `quest_progress`       | `schema-story.ts`     | Story      |
| `world_states`         | `schema-story.ts`     | Story      |
| `npc_states`           | `schema-story.ts`     | Story      |
| `location_states`      | `schema-story.ts`     | Story      |
| `synthetic_data`       | `schema-synthetic.ts` | Synthetic  |
| `items`                | `schema-story.ts`     | Story      |
| `world_items`          | `schema-story.ts`     | Story      |

## Enums Pattern

Each enum is a `const` object + type export:

```ts
// src/db/enums-core.ts
export const MessageVisibility = {
  Visible: "visible",
  HiddenByUser: "hidden_by_user",
  HiddenByModerator: "hidden_by_moderator",
  AutoHidden: "auto_hidden",
  Redacted: "redacted",
} as const;

export type MessageVisibility =
  (typeof MessageVisibility)[keyof typeof MessageVisibility];
```

Key enums from `enums-core.ts`:

| Enum                  | Values                                                          |
| --------------------- | --------------------------------------------------------------- |
| `UserRole`            | `admin`, `user`, `viewer`, `solo`                               |
| `SessionType`         | `web`, `tui`, `api`, `remote`                                   |
| `MessageVisibility`   | `visible`, `hidden_by_user`, `hidden_by_moderator`, `auto_hidden`, `redacted` |
| `MessageStatus`       | `sending`, `sent`, `confirmed`, `failed`, `cancelled`           |
| `ActorType`           | `user`, `character`, `narrator`, `system`                       |
| `ActorAgentType`      | `none`, `ai`, `narrator`, `npc`                                 |
| `ChatType`            | `user_character`, `user_user`, `user_assistant`                 |
| `ChatAccess`          | `private`, `shared`, `public`                                   |

Key enums from `enums-generation.ts`:

| Enum                  | Values                                                          |
| --------------------- | --------------------------------------------------------------- |
| `GenerationStatus`    | `pending`, `processing`, `streaming`, `completed`, `failed`, `cancelled` |
| `GenerationProvider`  | `openai`, `anthropic`, `google`, `mistral`, `ollama`, `openrouter`, `custom` |
| `CancelReason`        | `user_cancel`, `repetition_detected`, `policy_mismatch`, `response_limit`, `chat_switch`, `timeout`, `error` |

Key enums from `enums-story.ts`:

| Enum                  | Values                                                          |
| --------------------- | --------------------------------------------------------------- |
| `QuestStatus`         | `active`, `completed`, `failed`, `abandoned`                    |
| `TurnType`            | `player`, `gm`, `npc`, `narration`, `combat`                    |

## Schema Type Pattern

```ts
import { Generated, GeneratedAlways } from "kysely";

export interface Messages {
  id: GeneratedAlways<string>;     // Auto-generated UUID
  chat_id: string;                  // FK → chats.id
  actor_id: string;                 // FK → actors.id
  parent_id: string | null;         // FK → messages.id (tree model)
  content: string;                  // Message body (markdown)
  visibility: MessageVisibility;    // Enum
  status: MessageStatus;            // Enum
  created_at: Generated<string>;    // Auto-timestamp
  updated_at: Generated<string>;    // Auto-timestamp
}
```

- `GeneratedAlways<T>` — DB auto-sets (UUID, auto-increment), omit in inserts
- `Generated<T>` — DB provides default, can override in inserts
- Use `Insertable<Messages>` and `Updateable<Messages>` from Kysely for typed inserts/updates

## Migration Pattern

```ts
// src/db/migrations/001_initial.ts
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "text", (c) => c.notNull().primaryKey())
    .addColumn("username", "text", (c) => c.notNull().unique())
    .addColumn("role", "text", (c) => c.notNull().defaultTo("user"))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("users").execute();
}
```

Run: `bun run db:migrate`

## Common Query Patterns

```ts
import { db } from "../db";
import { MessageVisibility, GenerationStatus } from "../db/enums";

// Select with enum filter
const messages = await db
  .selectFrom("messages")
  .where("visibility", "=", MessageVisibility.Visible)
  .where("chat_id", "=", chatId)
  .orderBy("created_at", "asc")
  .selectAll()
  .execute();

// Insert with Generated fields omitted
await db
  .insertInto("messages")
  .values({
    chat_id: chatId,
    actor_id: actorId,
    content: "Hello world",
    visibility: MessageVisibility.Visible,
    status: MessageStatus.Sent,
  })
  .execute();

// Update
await db
  .updateTable("messages")
  .set({ status: MessageStatus.Confirmed })
  .where("id", "=", messageId)
  .execute();
```

## Common Pitfalls

1. **Importing DB-specific modules in services.** Only use Kysely types + db instance. Never import `bun:sqlite` in services/controllers.
2. **Forgetting enum values match DB strings.** Enums are string-valued in DB — the enum object is a type-safe reference, not a DB constraint.
3. **Omitting `Generated`/`GeneratedAlways` markers.** Schema types use these for insert/update type safety. Omitting them causes type errors on insert.
4. **Manual schema changes without migration.** Always create a migration file. Never alter the DB outside the migration system.
5. **Hardcoding table/column names.** Use Kysely's typed schema — never raw SQL strings for DML.