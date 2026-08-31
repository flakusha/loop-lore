// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E DH Ratchet + Skipped-Key Retention (TASK-asymmetric-key-pairs-followup §Phase B)
 *
 * Phase B upgrades the symmetric-ratchet-only design (Phase A) to a Double
 * Ratchet with skipped-key retention. The new pieces:
 *
 * 1. `e2e_sessions.root_key` (BLOB, nullable) — 32-byte root key. The
 *    current root is fed through HKDF with the DH output to produce the
 *    next root + chain key when an ephemeral changes.
 *
 * 2. `e2e_sessions.ephemeral_private` / `e2e_sessions.ephemeral_public`
 *    (BLOB/TEXT, nullable) — the session's current ECDH P-256 keypair.
 *    `private` is JSON-encoded JWK (extractable for serialization to
 *    IndexedDB); `public` is JSON-encoded JWK (safe to store as TEXT).
 *
 * 3. `e2e_sessions.sending_chain_key` / `e2e_sessions.receiving_chain_key`
 *    (BLOB, nullable) — per-direction chain keys. Two chains because
 *    Alice and Bob each have their own outgoing chain.
 *
 * 4. `e2e_sessions.send_count` / `e2e_sessions.recv_count` (INTEGER, default 0)
 *    — counters within the current chain. Ratchet step on a DH change;
 *    counters reset when the chain changes.
 *
 * 5. `e2e_skipped_keys` — per-session buffer of message keys the recipient
 *    has yet to receive but might receive later (out-of-order delivery).
 *    `(session_id, dh_public_jwk, counter)` is unique so re-arrivals don't
 *    double-store. `expires_at` lets us age out old keys without a CRON —
 *    queries filter `expires_at > now()`.
 *
 * Phase A left these columns absent: the table was `encrypted_chain_key`
 * + `step_count`. Phase B is **additive**: existing rows keep working
 * via the Phase A read paths (root_key = NULL => Phase A path). The
 * application code routes per-row.
 *
 * Threat model (carried over):
 *   - Server holds no client-side secrets (root_key, chain keys, skipped
 *     keys are all client-encrypted blobs).
 *   - Server is honest-but-curious: relays ciphertext + skipped-key
 *     buffers, never inspects.
 *   - Post-compromise security: a leaked root_key + chain key only
 *     decrypts up to the next DH step.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  // ── e2e_sessions: Phase B columns ────────────────────────────
  // All nullable so Phase A rows continue to work (root_key IS NULL =>
  // client falls back to Phase A `encrypted_chain_key` advance path).
  await db.schema
    .alterTable("e2e_sessions",)
    .addColumn("root_key", "blob",)
    .execute();

  // Per-direction chain keys (32 bytes each, as BLOB).
  await db.schema
    .alterTable("e2e_sessions",)
    .addColumn("sending_chain_key", "blob",)
    .execute();

  await db.schema
    .alterTable("e2e_sessions",)
    .addColumn("receiving_chain_key", "blob",)
    .execute();

  // Per-direction counters within the current chain. Reset on DH step.
  await db.schema
    .alterTable("e2e_sessions",)
    .addColumn("send_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await db.schema
    .alterTable("e2e_sessions",)
    .addColumn("recv_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  // Current ECDH P-256 ephemeral keypair. JSON-encoded JWKs. Private is
  // extractable so it can be persisted to IndexedDB by the client; the
  // server stores but never decrypts it.
  await db.schema
    .alterTable("e2e_sessions",)
    .addColumn("ephemeral_public_jwk", "text",)
    .execute();

  await db.schema
    .alterTable("e2e_sessions",)
    .addColumn("ephemeral_private_jwk", "text",)
    .execute();

  // ── e2e_skipped_keys ─────────────────────────────────────────
  // Holds up to MAX_SKIPPED_KEYS (configurable, default 10) message keys
  // that the recipient hasn't consumed yet but might still need for
  // out-of-order delivery. Each entry is tied to a specific (ephemeral,
  // counter) pair so when a late message arrives it can find its key.
  //
  // The encrypted message key (nonce + ciphertext + auth tag) is stored as
  // JSON so the value survives a round-trip without re-encoding.
  await db.schema
    .createTable("e2e_skipped_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("session_id", "text", (col,) => col.notNull().references("e2e_sessions.id",).onDelete("cascade",),)
    // Sender's ephemeral public key (JWK) at the time the message was sent.
    // JSON-encoded so the comparison is string-based.
    .addColumn("dh_public_jwk", "text", (col,) => col.notNull(),)
    // Counter within that ephemeral's sending chain.
    .addColumn("counter", "integer", (col,) => col.notNull(),)
    // AES-GCM-encrypted message key (the raw AES key, encrypted under the
    // session's skipped-key-wrap key, derived per-session). Stored as JSON:
    //   { nonce, ciphertext } (both base64).
    .addColumn("encrypted_message_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    // Expiry for garbage collection (queries filter `expires_at > now()`).
    .addColumn("expires_at", "text", (col,) => col.notNull(),)
    .execute();

  await db.schema
    .createIndex("uniq_e2e_skipped_keys_session_ephemeral_counter",)
    .on("e2e_skipped_keys",)
    .columns(["session_id", "dh_public_jwk", "counter",],)
    .execute();

  // Fast lookup by session + recency (used for cleanup queries).
  await db.schema
    .createIndex("idx_e2e_skipped_keys_session_expires",)
    .on("e2e_skipped_keys",)
    .columns(["session_id", "expires_at",],)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropTable("e2e_skipped_keys",).execute();

  await db.schema.alterTable("e2e_sessions",).dropColumn("ephemeral_private_jwk",).execute();
  await db.schema.alterTable("e2e_sessions",).dropColumn("ephemeral_public_jwk",).execute();
  await db.schema.alterTable("e2e_sessions",).dropColumn("recv_count",).execute();
  await db.schema.alterTable("e2e_sessions",).dropColumn("send_count",).execute();
  await db.schema.alterTable("e2e_sessions",).dropColumn("receiving_chain_key",).execute();
  await db.schema.alterTable("e2e_sessions",).dropColumn("sending_chain_key",).execute();
  await db.schema.alterTable("e2e_sessions",).dropColumn("root_key",).execute();
}
