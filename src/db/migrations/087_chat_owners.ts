// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 087_chat_owners (TASK-chat-owners-schema-and-backfill,
 * epic-chat-multi-ownership) — numbered 087 on the duplicate-prefix
 * reconciliation (084-086 were taken on dev).
 *
 * Co-owners table: the SET of users holding owner authority over a chat.
 * `chats.created_by` is retained unchanged as the creator (append-only);
 * this table is seeded from it — one row per existing chat, `granted_by`
 * null (the creator was granted by no one). The epic's later tickets move
 * every `created_by === userId` authority check onto membership here.
 *
 * `uq_chat_owners_chat_user` makes the database the arbiter of "never the
 * same owner twice"; `idx_chat_owners_user` serves the reverse lookup
 * ("which chats does this user own") the same way `idx_chats_created_by`
 * serves it for the creator column. `down()` drops the table, which also
 * removes the backfilled rows — the pre-087 shape is exactly "no table".
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("chat_owners",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("granted_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("granted_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("reason", "text",)
    .addUniqueConstraint("uq_chat_owners_chat_user", ["chat_id", "user_id",],)
    .addCheckConstraint("ck_chat_owners_reason", sql`length(reason) <= 500`,)
    .execute();

  await database.schema
    .createIndex("idx_chat_owners_user",)
    .on("chat_owners",)
    .column("user_id",)
    .execute();

  // Backfill: one owners row per chat, from the creator. `reason`/`granted_by`
  // stay null — the seed grant carries no audit attribution.
  await sql`
    INSERT INTO chat_owners (chat_id, user_id, granted_at)
    SELECT id, created_by, datetime('now') FROM chats
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("chat_owners",).execute();
}
