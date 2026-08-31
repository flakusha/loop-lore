// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Session Lookup (TASK-asymmetric-key-pairs-followup — Phase A/B/C/D)
 *
 * Read-only server-side helpers for the `e2e_sessions` table. The server
 * holds ONLY the session identifier + (sender, recipient) pair (or
 * chat for group sessions); the chain state and message keys live
 * exclusively on the client.
 *
 *   - findSession / findActiveSession  : read
 *   - ensureActiveSession              : idempotent create on first send
 *   - recordMessageSent                : bookkeeping (last_message_at)
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

/** */
export interface E2eSessionRow {
  id: string;
  senderActorId: string;
  recipientActorId: string | null;
  chatId: string | null;
  kind: "pair" | "group";
  createdAt: string;
  lastMessageAt: string | null;
  revokedAt: string | null;
}

/** */
export interface FindSessionOpts {
  database: Kysely<DB>;
  sessionId: string;
}

/** */
export interface FindActiveSessionOpts {
  database: Kysely<DB>;
  senderActorId: string;
  recipientActorId: string;
}

/** */
export interface EnsureActiveSessionOpts {
  database: Kysely<DB>;
  senderActorId: string;
  recipientActorId: string;
  /** Set for `kind: 'group'` sessions; omitted for 1:1 pair sessions. */
  chatId?: string;
  kind?: "pair" | "group";
}

/** */
export interface RecordMessageSentOpts {
  database: Kysely<DB>;
  sessionId: string;
}

/** */
export interface RevokeSessionOpts {
  database: Kysely<DB>;
  sessionId: string;
}

/**
 * Look up a session by id. Returns `null` if no such row exists. Includes
 * revoked rows — callers that want only active sessions should filter on
 * `revokedAt === null` themselves, or use `findActiveSession`.
 * @param opts
 */
export async function findSession(opts: FindSessionOpts,): Promise<E2eSessionRow | null> {
  const row = await opts.database
    .selectFrom("e2e_sessions",)
    .selectAll()
    .where("id", "=", opts.sessionId,)
    .executeTakeFirst();
  return row ? rowToSession(row as E2eSessionsDbRow,) : null;
}

/**
 * Find the active (non-revoked) session for a (sender, recipient) pair.
 * Returns `null` if no session exists or the only one is revoked.
 * @param opts
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
    .orderBy("created_at", "desc",)
    .limit(1,)
    .executeTakeFirst();
  return row ? rowToSession(row as E2eSessionsDbRow,) : null;
}

/**
 * Get the active session for a (sender, recipient) pair, creating one if
 * none exists. Idempotent — concurrent callers may race; the unique index
 * `idx_e2e_sessions_pair` makes the second insert fail with a constraint
 * error which is then handled by a re-read.
 *
 * For group sessions (kind === 'group'), pass `chatId` and omit
 * `recipientActorId`; the row carries no directed recipient, only a
 * chat_id anchor.
 * @param opts
 */
export async function ensureActiveSession(
  opts: EnsureActiveSessionOpts,
): Promise<E2eSessionRow> {
  const kind = opts.kind ?? "pair";
  if (kind === "pair") {
    const existing = await findActiveSession({
      database: opts.database,
      senderActorId: opts.senderActorId,
      recipientActorId: opts.recipientActorId,
    },);
    if (existing) { return existing; }
  } else {
    const existing = await opts.database
      .selectFrom("e2e_sessions",)
      .selectAll()
      .where("sender_actor_id", "=", opts.senderActorId,)
      .where("chat_id", "=", opts.chatId ?? "",)
      .where("kind", "=", "group",)
      .where("revoked_at", "is", null,)
      .orderBy("created_at", "desc",)
      .limit(1,)
      .executeTakeFirst();
    if (existing) { return rowToSession(existing as E2eSessionsDbRow,); }
  }

  const id = uid();
  try {
    const values: {
      id: string;
      sender_actor_id: string;
      recipient_actor_id?: string;
      chat_id?: string;
      kind: "pair" | "group";
    } = {
      id,
      sender_actor_id: opts.senderActorId,
      kind,
    };
    if (kind === "pair") {
      values.recipient_actor_id = opts.recipientActorId;
    } else if (opts.chatId) {
      values.chat_id = opts.chatId;
    }
    await opts.database
      .insertInto("e2e_sessions",)
      .values(values,)
      .execute();
  } catch (err) {
    // Concurrent insert lost the race; re-read.
    const raced = kind === "pair"
      ? await findActiveSession({
        database: opts.database,
        senderActorId: opts.senderActorId,
        recipientActorId: opts.recipientActorId,
      },)
      : await opts.database
        .selectFrom("e2e_sessions",)
        .selectAll()
        .where("sender_actor_id", "=", opts.senderActorId,)
        .where("chat_id", "=", opts.chatId ?? "",)
        .where("kind", "=", "group",)
        .where("revoked_at", "is", null,)
        .orderBy("created_at", "desc",)
        .limit(1,)
        .executeTakeFirst()
        .then((row,) => (row ? rowToSession(row as E2eSessionsDbRow,) : null));
    if (raced) { return raced; }
    throw err;
  }
  const created = await findSession({ database: opts.database, sessionId: id, },);
  if (!created) {
    throw new Error(`e2e-session: insert succeeded but row ${id} not found`,);
  }
  return created;
}

/**
 * Update `last_message_at` after a successful send. Best-effort — the
 * caller already has a valid `sessionId` from `ensureActiveSession`.
 * @param opts
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
 * @param opts
 */
export async function revokeSession(opts: RevokeSessionOpts,): Promise<boolean> {
  const result = await opts.database
    .updateTable("e2e_sessions",)
    .set({ revoked_at: sql`(datetime('now'))`, },)
    .where("id", "=", opts.sessionId,)
    .where("revoked_at", "is", null,)
    .executeTakeFirst();
  return (result?.numUpdatedRows ?? 0) > 0;
}

// ── Row mapping ─────────────────────────────────────────────

interface E2eSessionsDbRow {
  id: string;
  sender_actor_id: string;
  recipient_actor_id: string | null;
  chat_id: string | null;
  kind: "pair" | "group";
  created_at: string;
  last_message_at: string | null;
  revoked_at: string | null;
}

/**
 * @param row
 */
function rowToSession(row: E2eSessionsDbRow,): E2eSessionRow {
  return {
    id: row.id,
    senderActorId: row.sender_actor_id,
    recipientActorId: row.recipient_actor_id,
    chatId: row.chat_id,
    kind: row.kind,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    revokedAt: row.revoked_at,
  };
}
