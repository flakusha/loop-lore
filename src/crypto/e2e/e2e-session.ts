// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Session Lookup (TASK-asymmetric-key-pairs-followup — Phase A)
 *
 * Read-only server-side helpers for the `e2e_sessions` table. The server
 * holds ONLY the session identifier + (sender, recipient) pair; the chain
 * state and message keys live exclusively on the client.
 *
 *   - findSession / findActiveSession  : read
 *   - recordMessageSent                : bookkeeping on a successful send
 *                                       (just `last_message_at`)
 *   - revokeSession                    : soft-revoke (one session)
 *
 * Server cannot decrypt anything stored in `messages.e2e_payload` — the
 * lookup is intentionally minimal so the read path leaks nothing about
 * plaintext content.
 */

import type { Kysely, } from "kysely";
import { sql, } from "kysely";

import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";

export interface E2eSessionRow {
  id: string;
  senderActorId: string;
  recipientActorId: string;
  createdAt: string;
  lastMessageAt: string | null;
  revokedAt: string | null;
}

export interface FindSessionOpts {
  database: Kysely<DB>;
  sessionId: string;
}

export interface FindActiveSessionOpts {
  database: Kysely<DB>;
  senderActorId: string;
  recipientActorId: string;
}

export interface EnsureActiveSessionOpts {
  database: Kysely<DB>;
  senderActorId: string;
  recipientActorId: string;
}

export interface RecordMessageSentOpts {
  database: Kysely<DB>;
  sessionId: string;
}

export interface RevokeSessionOpts {
  database: Kysely<DB>;
  sessionId: string;
}

/**
 * Look up a session by id. Returns `null` if no such row exists. Includes
 * revoked rows — callers that want only active sessions should filter on
 * `revokedAt === null` themselves, or use `findActiveSession`.
 */
export async function findSession(opts: FindSessionOpts,): Promise<E2eSessionRow | null> {
  const row = await opts.database
    .selectFrom("e2e_sessions",)
    .selectAll()
    .where("id", "=", opts.sessionId,)
    .executeTakeFirst();
  return row ? rowToSession(row,) : null;
}

/**
 * Find the active (non-revoked) session for a (sender, recipient) pair.
 * Returns `null` if no session exists or the only one is revoked.
 */
export async function findActiveSession(
  opts: FindActiveSessionOpts,
): Promise<E2eSessionRow | null> {
  const row = await opts.database
    .selectFrom("e2e_sessions",)
    .selectAll()
    .where("sender_actor_id", "=", opts.senderActorId,)
    .where("recipient_actor_id", "=", opts.recipientActorId,)
    .where("revoked_at", "is", null,)
    .executeTakeFirst();
  return row ? rowToSession(row,) : null;
}

/**
 * Get the active session for a (sender, recipient) pair, creating one if
 * none exists. Idempotent — concurrent callers may race; the unique index
 * `idx_e2e_sessions_pair` makes the second insert fail with a constraint
 * error which is then handled by a re-read.
 *
 * NOTE: this is the ONLY write helper — session creation must succeed even
 * on the very first encrypted message, before any prior session exists.
 */
export async function ensureActiveSession(
  opts: EnsureActiveSessionOpts,
): Promise<E2eSessionRow> {
  const existing = await findActiveSession(opts,);
  if (existing) return existing;

  const id = uid();
  try {
    await opts.database
      .insertInto("e2e_sessions",)
      .values({
        id,
        sender_actor_id: opts.senderActorId,
        recipient_actor_id: opts.recipientActorId,
        created_at: sql`(datetime('now'))`,
      },)
      .execute();
  } catch (err) {
    // Concurrent insert lost the race; re-read.
    const raced = await findActiveSession(opts,);
    if (raced) return raced;
    throw err;
  }
  const created = await findSession({ database: opts.database, sessionId: id, },);
  if (!created) {
    throw new Error(`e2e-session: insert succeeded but row ${id} not found`);
  }
  return created;
}

/**
 * Update `last_message_at` after a successful send. Best-effort — the
 * caller already has a valid `sessionId` from `ensureActiveSession`.
 */
export async function recordMessageSent(opts: RecordMessageSentOpts,): Promise<void> {
  await opts.database
    .updateTable("e2e_sessions",)
    .set({ last_message_at: sql`(datetime('now'))`, },)
    .where("id", "=", opts.sessionId,)
    .execute();
}

/**
 * Soft-revoke a session. Idempotent: revoking a revoked session is a no-op.
 */
export async function revokeSession(opts: RevokeSessionOpts,): Promise<boolean> {
  const result = await opts.database
    .updateTable("e2e_sessions",)
    .set({ revoked_at: sql`(datetime('now'))`, },)
    .where("id", "=", opts.sessionId,)
    .where("revoked_at", "is", null,)
    .executeTakeFirst();
  return (result.numUpdatedRows ?? 0) > 0;
}

// ── Row mapping ─────────────────────────────────────────────

interface E2eSessionsDbRow {
  id: string;
  sender_actor_id: string;
  recipient_actor_id: string;
  created_at: string;
  last_message_at: string | null;
  revoked_at: string | null;
}

function rowToSession(row: E2eSessionsDbRow,): E2eSessionRow {
  return {
    id: row.id,
    senderActorId: row.sender_actor_id,
    recipientActorId: row.recipient_actor_id,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    revokedAt: row.revoked_at,
  };
}
