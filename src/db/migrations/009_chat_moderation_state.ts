// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat moderation state columns (TASK-chat-feature-moderation).
 *
 * Adds two per-participant columns to `chat_participants`:
 *
 * - `muted_until` (text, nullable) — ISO-8601 timestamp until which the
 *   participant's outbound and inbound messages should be suppressed.
 *   `null` = not muted. Read by the `isMuted(participant, now)` predicate
 *   in `src/chat/moderation.ts`. Stored as text for SQLite parity with
 *   the rest of the schema; comparison is lexicographic / ISO-8601.
 * - `banned_until` (text, nullable) — ISO-8601 timestamp until which the
 *   participant is banned from the chat. `null` = not banned. When set,
 *   the `applyBan` primitive refuses to re-add the target even via a
 *   join call. `banned_until IS NULL` is the join predicate. A scope
 *   `"global"` ban lifts this and also writes a `nsfw_user_preferences`
 *   tombstone, but that is out of scope for this column-only migration.
 *
 * Both columns are nullable so existing rows need no backfill; historical
 * participants remain unmated / unbanned. The migration bumps the logical
 * schema version to 30 (was 29 after 008_memory_source_chain).
 */
import type { Kysely, } from "kysely";
import { recordSchemaVersion, removeSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chat_participants",)
    .addColumn("muted_until", "text",)
    .execute();

  await database.schema
    .alterTable("chat_participants",)
    .addColumn("banned_until", "text",)
    .execute();

  await database.schema
    .createIndex("idx_chat_participants_muted_until",)
    .on("chat_participants",)
    .column("muted_until",)
    .execute();

  await database.schema
    .createIndex("idx_chat_participants_banned_until",)
    .on("chat_participants",)
    .column("banned_until",)
    .execute();

  await recordSchemaVersion(
    database,
    30,
    "chat participant muted_until / banned_until (TASK-chat-feature-moderation)",
  );
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_chat_participants_banned_until",).execute();
  await database.schema.dropIndex("idx_chat_participants_muted_until",).execute();
  await database.schema.alterTable("chat_participants",).dropColumn("banned_until",).execute();
  await database.schema.alterTable("chat_participants",).dropColumn("muted_until",).execute();
  await removeSchemaVersion(database, 30,);
}
