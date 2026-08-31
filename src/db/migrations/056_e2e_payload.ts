// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Message Payload (TASK-asymmetric-key-pairs-followup — Phase A/B/C/D)
 *
 * Storage for client-side-encrypted message content. The server never holds
 * plaintext for any `at-rest` tier chat — the wire payload is the
 * self-describing ciphertext blob produced by `encrypt-message` /
 * `group-encrypt-message`.
 *
 * Phase A columns:
 *   - messages.e2e_payload (TEXT, nullable) — JSON blob holding the per-
 *     message ciphertext + nonce + sender-side ratchet metadata.
 *   - messages.e2e_session_id (TEXT, nullable) — FK → e2e_sessions.id.
 *
 * Phase B columns (double ratchet — per-message DH forward secrecy):
 *   - messages.e2e_sender_eph_pub_jwk — JWK of the sender's ephemeral ECDH
 *     public key used to derive this message's chain step.
 *   - messages.e2e_chain_index — 0-based index for this (sender,recipient)
 *     pair so the receiver can advance the chain ratchet by n steps.
 *
 * Phase C additions to `e2e_sessions`:
 *   - chat_id — group session ties all group sends for one chat together
 *     (allows rotation on member join/leave).
 *   - kind — 'pair' (1:1) or 'group' (1:N sender-key distribution).
 *
 * New tables:
 *   - e2e_group_wraps — per-(group_session, recipient_actor) wraps of the
 *     current sender-chain key. Each message writes one row per recipient.
 *   - e2e_skipped_message_keys — per-receiver skipped-message keys for
 *     out-of-order delivery. Capped at MAX_SKIP=100 per session per
 *     recipient; aged out by a cleanup job (Phase D follow-up).
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  // ── e2e_sessions table ───────────────────────────────────
  await db.schema
    .createTable("e2e_sessions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("sender_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.references("actors.id",).onDelete("cascade",),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",),)
    .addColumn("kind", "text", (col,) => col.notNull().defaultTo("pair",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_message_at", "text",)
    .addColumn("revoked_at", "text",)
    .execute();

  await db.schema
    .createIndex("idx_e2e_sessions_pair",)
    .unique()
    .on("e2e_sessions",)
    .columns(["sender_actor_id", "recipient_actor_id",],)
    .execute();

  // ── messages columns (Phase A + B) ──────────────────────
  // SQLite cannot ADD multiple columns in a single statement; emit one
  // ALTER per column. Each column is in its own typed ALTER so the schema
  // type generator picks it up.
  await db.schema.alterTable("messages",).addColumn("e2e_payload", "text",).execute();
  await db.schema
    .alterTable("messages",)
    .addColumn("e2e_session_id", "text", (col,) => col.references("e2e_sessions.id",).onDelete("set null",),)
    .execute();
  await db.schema.alterTable("messages",).addColumn("e2e_sender_eph_pub_jwk", "text",).execute();
  await db.schema.alterTable("messages",).addColumn("e2e_chain_index", "integer",).execute();

  await db.schema
    .createIndex("idx_messages_e2e_session",)
    .on("messages",)
    .column("e2e_session_id",)
    .execute();
  await db.schema
    .createIndex("idx_messages_e2e_chain",)
    .on("messages",)
    .columns(["e2e_session_id", "e2e_chain_index",],)
    .execute();

  // ── e2e_group_wraps — Phase C (sender-key distribution) ──
  await db.schema
    .createTable("e2e_group_wraps",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("group_session_id", "text", (col,) => col.notNull().references("e2e_sessions.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("wrapped_key", "text", (col,) => col.notNull(),)
    .addColumn("sender_eph_pub_jwk", "text", (col,) => col.notNull(),)
    .addColumn("chain_index", "integer", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await db.schema
    .createIndex("idx_e2e_group_wraps_session_idx",)
    .unique()
    .on("e2e_group_wraps",)
    .columns(["group_session_id", "chain_index",],)
    .execute();
  await db.schema
    .createIndex("idx_e2e_group_wraps_recipient",)
    .on("e2e_group_wraps",)
    .columns(["recipient_actor_id", "group_session_id",],)
    .execute();

  // ── e2e_skipped_message_keys — Phase B (out-of-order delivery) ──
  await db.schema
    .createTable("e2e_skipped_message_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("session_id", "text", (col,) => col.notNull().references("e2e_sessions.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("chain_index", "integer", (col,) => col.notNull(),)
    .addColumn("message_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await db.schema
    .createIndex("idx_skipped_keys_lookup",)
    .unique()
    .on("e2e_skipped_message_keys",)
    .columns(["session_id", "recipient_actor_id", "chain_index",],)
    .execute();
  await db.schema
    .createIndex("idx_skipped_keys_age",)
    .on("e2e_skipped_message_keys",)
    .column("created_at",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropIndex("idx_skipped_keys_age",).execute();
  await db.schema.dropIndex("idx_skipped_keys_lookup",).execute();
  await db.schema.dropTable("e2e_skipped_message_keys",).execute();
  await db.schema.dropIndex("idx_e2e_group_wraps_recipient",).execute();
  await db.schema.dropIndex("idx_e2e_group_wraps_session_idx",).execute();
  await db.schema.dropTable("e2e_group_wraps",).execute();
  await db.schema.dropIndex("idx_messages_e2e_chain",).execute();
  await db.schema.dropIndex("idx_messages_e2e_session",).execute();
  // Drop the four new columns explicitly.
  await sql`ALTER TABLE messages DROP COLUMN e2e_chain_index`.execute(db,);
  await sql`ALTER TABLE messages DROP COLUMN e2e_sender_eph_pub_jwk`.execute(db,);
  await sql`ALTER TABLE messages DROP COLUMN e2e_session_id`.execute(db,);
  await sql`ALTER TABLE messages DROP COLUMN e2e_payload`.execute(db,);
  await db.schema.dropIndex("idx_e2e_sessions_pair",).execute();
  await db.schema.dropTable("e2e_sessions",).execute();
}
