// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Memory source-chain migration (TASK-memory-history-search bind chain).
 *
 * Extends `actor_memories` (created by parts/012_memory.ts) with the
 * chain fields that bind each compacted memory summary back to the
 * chat messages it was extracted from:
 *
 * - `source_message_ids` — JSON array of message IDs bound at extraction
 *   (backfilled from the legacy single `source_message_id`).
 * - `source_chat_ids` — JSON array of chat IDs (chains may span chats
 *   via carry-forward / side chats feeding main).
 * - `extraction_kind` — how the memory was formed
 *   (`single_response` | `burst` | `compaction` | `manual` | `carry_forward`).
 * - `context_window_start` / `context_window_end` — game-time bounds of
 *   the source span (timescape-aware decay, future use).
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { recordSchemaVersion, removeSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actor_memories",)
    .addColumn("source_message_ids", "text",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("source_chat_ids", "text",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("extraction_kind", "text",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("context_window_start", "text",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("context_window_end", "text",)
    .execute();

  // Backfill: legacy single source_message_id → one-element JSON array.
  // Rows with NULL/empty source_message_id keep NULL (unbound memories).
  await sql`UPDATE actor_memories
    SET source_message_ids = json_array(source_message_id)
    WHERE source_message_id IS NOT NULL AND source_message_id != ''`.execute(database,);

  // Backfill source_chat_ids from source_chat_id where present.
  await sql`UPDATE actor_memories
    SET source_chat_ids = json_array(source_chat_id)
    WHERE source_chat_id IS NOT NULL AND source_chat_id != ''`.execute(database,);

  await database.schema
    .createIndex("idx_actor_memories_source_msg_ids",)
    .on("actor_memories",)
    .column("source_message_ids",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_source_chat_ids",)
    .on("actor_memories",)
    .column("source_chat_ids",)
    .execute();

  await recordSchemaVersion(
    database,
    29,
    "memory source chain (message/chat id arrays, extraction kind, window bounds)",
  );
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .dropIndex("idx_actor_memories_source_chat_ids",)
    .execute();

  await database.schema
    .dropIndex("idx_actor_memories_source_msg_ids",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .dropColumn("context_window_end",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .dropColumn("context_window_start",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .dropColumn("extraction_kind",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .dropColumn("source_chat_ids",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .dropColumn("source_message_ids",)
    .execute();

  await removeSchemaVersion(database, 29,);
}
