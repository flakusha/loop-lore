// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 013_chat_branches
 *
 * Adds the `chat_branches` table for FEAT-045 conversation branching.
 * Each row is one explicit fork off a chat's message tree:
 *   - chat_id              -> which chat this branch belongs to
 *   - parent_message_id    -> the fork point (root of the branch's message chain)
 *   - name                 -> human label
 *   - is_active            -> soft flag (1 = active, 0 = archived)
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("chat_branches",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("parent_message_id", "text", (col,) => col.notNull().references("messages.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("is_active", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();

  await database.schema
    .createIndex("idx_chat_branches_chat",)
    .on("chat_branches",)
    .column("chat_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_chat_branches_chat",).execute();
  await database.schema.dropTable("chat_branches",).execute();
}
