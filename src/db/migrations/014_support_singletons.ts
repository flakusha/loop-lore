// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 014_support_singletons — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("plugin_state",)
    .addColumn("name", "text", (col,) => col.primaryKey(),)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .addColumn("enabled_at", "text",)
    .addColumn("disabled_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("config_json", "text",)
    .addColumn("origin", "text",)
    .execute();

  await database.schema
    .createTable("e2e_group_wraps",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("group_session_id", "text", (col,) => col.notNull().references("e2e_sessions.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("wrapped_key", "text", (col,) => col.notNull(),)
    .addColumn("sender_eph_pub_jwk", "text", (col,) => col.notNull(),)
    .addColumn("chain_index", "integer", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("e2e_sessions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("sender_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.references("actors.id",).onDelete("cascade",),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",),)
    .addColumn("kind", "text", (col,) => col.defaultTo("pair",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("last_message_at", "text",)
    .addColumn("revoked_at", "text",)
    .addColumn("root_key", "blob",)
    .addColumn("sending_chain_key", "blob",)
    .addColumn("receiving_chain_key", "blob",)
    .addColumn("send_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("recv_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
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
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("expires_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("e2e_skipped_message_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("session_id", "text", (col,) => col.notNull().references("e2e_sessions.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("chain_index", "integer", (col,) => col.notNull(),)
    .addColumn("message_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  // raw index: idx_e2e_group_wraps_recipient
  await sql`CREATE INDEX "idx_e2e_group_wraps_recipient" on "e2e_group_wraps" ("recipient_actor_id", "group_session_id")`
    .execute(database,);

  // raw index: idx_e2e_group_wraps_session_idx
  await sql`CREATE UNIQUE INDEX "idx_e2e_group_wraps_session_idx" on "e2e_group_wraps" ("group_session_id", "chain_index")`
    .execute(database,);

  // raw index: idx_e2e_sessions_pair
  await sql`CREATE UNIQUE INDEX "idx_e2e_sessions_pair" on "e2e_sessions" ("sender_actor_id", "recipient_actor_id")`
    .execute(database,);

  // raw index: idx_e2e_skipped_keys_session_expires
  await sql`CREATE INDEX "idx_e2e_skipped_keys_session_expires" on "e2e_skipped_keys" ("session_id", "expires_at")`
    .execute(database,);

  // raw index: idx_skipped_keys_age
  await sql`CREATE INDEX "idx_skipped_keys_age" on "e2e_skipped_message_keys" ("created_at")`.execute(database,);
  // raw index: idx_skipped_keys_lookup
  await sql`CREATE UNIQUE INDEX "idx_skipped_keys_lookup" on "e2e_skipped_message_keys" ("session_id", "recipient_actor_id", "chain_index")`
    .execute(database,);

  // raw index: uniq_e2e_skipped_keys_session_ephemeral_counter
  await sql`CREATE INDEX "uniq_e2e_skipped_keys_session_ephemeral_counter" on "e2e_skipped_keys" ("session_id", "dh_public_jwk", "counter")`
    .execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("e2e_skipped_message_keys",).execute();
  await database.schema.dropTable("e2e_skipped_keys",).execute();
  await database.schema.dropTable("e2e_sessions",).execute();
  await database.schema.dropTable("e2e_group_wraps",).execute();
  await database.schema.dropTable("plugin_state",).execute();
}
