// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 071_message_polls (TASK-message-polls-votes)
 *
 * Native in-chat polls attached to a message, one poll per message.
 * `options` is a JSON string array (option order is the vote index);
 * `multi` allows several distinct options per voter, enforced by the
 * (poll_id, user_id, option_idx) unique constraint that also dedups
 * double-votes — mirroring the message_reactions pattern from 001_init
 * with the dedup pushed into the schema instead of check-then-insert.
 *
 * `closed_at` is the close stamp; once set, votes are rejected with 409.
 * `closes_at` is an optional scheduled auto-close hint for callers.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("message_polls",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().unique().references("messages.id",).onDelete("cascade",),)
    .addColumn("question", "text", (col,) => col.notNull(),)
    .addColumn("options", "text", (col,) => col.notNull(),)
    .addColumn("multi", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_by", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("closes_at", "text",)
    .addColumn("closed_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("poll_votes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("poll_id", "text", (col,) => col.notNull().references("message_polls.id",).onDelete("cascade",),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("option_idx", "integer", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addUniqueConstraint("uq_poll_votes_poll_user_option", ["poll_id", "user_id", "option_idx",],)
    .execute();

  await database.schema
    .createIndex("idx_poll_votes_poll",)
    .on("poll_votes",)
    .column("poll_id",)
    .execute();

  await database.schema
    .createIndex("idx_poll_votes_user",)
    .on("poll_votes",)
    .column("user_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("poll_votes",).execute();
  await database.schema.dropTable("message_polls",).execute();
}
