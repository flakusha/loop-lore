// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E — final-form schema (E2E encryption).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("e2e_group_wraps",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("group_session_id", "text", (col,) => col.notNull().references("e2e_sessions.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("wrapped_key", "text", (col,) => col.notNull(),)
    .addColumn("sender_eph_pub_jwk", "text", (col,) => col.notNull(),)
    .addColumn("chain_index", "integer", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("e2e_sessions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("sender_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.references("actors.id",).onDelete("cascade",),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",),)
    .addColumn("kind", "text", (col,) => col.notNull().defaultTo("pair",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_message_at", "text",)
    .addColumn("revoked_at", "text",)
    .addColumn("root_key", "blob",)
    .addColumn("sending_chain_key", "blob",)
    .addColumn("receiving_chain_key", "blob",)
    .addColumn("send_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("recv_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("ephemeral_public_jwk", "text",)
    .addColumn("ephemeral_private_jwk", "text",)
    .execute();

  await database.schema
    .createTable("e2e_skipped_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("session_id", "text", (col,) => col.notNull().references("e2e_sessions.id",).onDelete("cascade",),)
    .addColumn("dh_public_jwk", "text", (col,) => col.notNull(),)
    .addColumn("counter", "integer", (col,) => col.notNull(),)
    .addColumn("encrypted_message_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("e2e_skipped_message_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("session_id", "text", (col,) => col.notNull().references("e2e_sessions.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("chain_index", "integer", (col,) => col.notNull(),)
    .addColumn("message_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_e2e_group_wraps_recipient",)
    .on("e2e_group_wraps",)
    .columns(["recipient_actor_id", "group_session_id",],)
    .execute();

  await database.schema
    .createIndex("idx_e2e_group_wraps_session_idx",)
    .on("e2e_group_wraps",)
    .columns(["group_session_id", "chain_index",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_e2e_sessions_pair",)
    .on("e2e_sessions",)
    .columns(["sender_actor_id", "recipient_actor_id",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_e2e_skipped_keys_session_expires",)
    .on("e2e_skipped_keys",)
    .columns(["session_id", "expires_at",],)
    .execute();

  await database.schema
    .createIndex("idx_skipped_keys_age",)
    .on("e2e_skipped_message_keys",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_skipped_keys_lookup",)
    .on("e2e_skipped_message_keys",)
    .columns(["session_id", "recipient_actor_id", "chain_index",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("uniq_e2e_skipped_keys_session_ephemeral_counter",)
    .on("e2e_skipped_keys",)
    .columns(["session_id", "dh_public_jwk", "counter",],)
    .execute();
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("e2e_skipped_message_keys",).execute();
  await database.schema.dropTable("e2e_skipped_keys",).execute();
  await database.schema.dropTable("e2e_group_wraps",).execute();
  await database.schema.dropTable("e2e_sessions",).execute();
}
