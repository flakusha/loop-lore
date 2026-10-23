// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 071_message_translations_variants
 *
 * Bring `message_translations` to the chat-first variant form:
 * - encryption columns mirroring `messages` (key_id, content_encoding,
 *   e2e_payload, e2e_session_id, e2e_sender_eph_pub_jwk, e2e_chain_index,
 *   content_plaintext) so translation rows encrypt via the same path as
 *   message content
 * - UNIQUE (message_id, locale) so retranslation is an idempotent upsert.
 *
 * Append-only per current policy (compaction has not landed). No
 * `status`/`source_lang` in v1 (row-or-no-row publication model).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("message_translations",)
    .addColumn("key_id", "text",)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .addColumn("content_encoding", "text", (col,) => col.notNull().defaultTo("identity",),)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .addColumn("e2e_payload", "text",)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .addColumn("e2e_session_id", "text", (col,) => col.references("e2e_sessions.id",).onDelete("set null",),)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .addColumn("e2e_sender_eph_pub_jwk", "text",)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .addColumn("e2e_chain_index", "integer",)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .addColumn("content_plaintext", "text",)
    .execute();

  await database.schema
    .createIndex("idx_message_translations_message_locale_unique",)
    .on("message_translations",)
    .columns(["message_id", "locale",],)
    .unique()
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .dropIndex("idx_message_translations_message_locale_unique",)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .dropColumn("content_plaintext",)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .dropColumn("e2e_chain_index",)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .dropColumn("e2e_sender_eph_pub_jwk",)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .dropColumn("e2e_session_id",)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .dropColumn("e2e_payload",)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .dropColumn("content_encoding",)
    .execute();

  await database.schema
    .alterTable("message_translations",)
    .dropColumn("key_id",)
    .execute();
}
