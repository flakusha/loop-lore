// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 021_game_states
 *
 * Persisted spatial snapshots of the RPG scene, extracted from fenced
 * ```game-state blocks in assistant narration. Feeds the 2D game canvas
 * and the diff-analysis pass that re-injects state summaries into prompts.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("game_states",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("message_id", "text", (col,) => col.references("messages.id",),)
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_game_states_chat",)
    .on("game_states",)
    .columns(["chat_id", "created_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_game_states_chat",).execute();
  await database.schema.dropTable("game_states",).execute();
}
