// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Message Payload (TASK-asymmetric-key-pairs-followup — Phase A)
 *
 * Adds the storage shape for client-side-encrypted message payloads:
 *
 *   - messages.e2e_payload (TEXT, nullable) — base64 ciphertext + nonce
 *     + ephemeral public key + chain key (JSON-encoded). When set, the
 *     server-mediated `messages.content` is empty/identity.
 *   - messages.e2e_session_id (TEXT, nullable) — FK → e2e_sessions.id for
 *     the sender→recipient pair that produced this ciphertext.
 *
 *   - e2e_sessions table — one row per (sender_actor_id, recipient_actor_id)
 *     pair. Holds the server-visible session identifier and metadata; the
 *     actual chain state lives ONLY on the client.
 *
 * Indexes:
 *   - uniq(sender_actor_id, recipient_actor_id) — one active session per
 *     directed pair.
 *
 * Threat model:
 *   - Server stores ciphertext + session metadata only. Cannot decrypt.
 *   - Server-side session id is just for the read path to know "this
 *     message belongs to this conversation"; the chain state is client-side.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  // ── e2e_sessions table ───────────────────────────────────
  await db.schema
    .createTable("e2e_sessions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("sender_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
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

  // ── messages columns ────────────────────────────────────
  // SQLite cannot ADD multiple columns in one statement; do them separately.
  await sql`ALTER TABLE messages ADD COLUMN e2e_payload TEXT`.execute(db,);
  await sql`ALTER TABLE messages ADD COLUMN e2e_session_id TEXT REFERENCES e2e_sessions(id) ON DELETE SET NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await sql`ALTER TABLE messages DROP COLUMN e2e_session_id`.execute(db,);
  await sql`ALTER TABLE messages DROP COLUMN e2e_payload`.execute(db,);
  await db.schema.dropIndex("idx_e2e_sessions_pair",).execute();
  await db.schema.dropTable("e2e_sessions",).execute();
}
