// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Scheduled messages — CRUD half (TASK-scheduled-messages-reminders).
 *
 * The dispatch half lives in `./dispatcher.ts`; this module owns the rows.
 * All queries are raw Kysely (no DB-specific imports) so a dialect swap is
 * a one-file change.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { toDate, } from "../../utils/date";
import type { ScheduledMessage, ScheduleMessageParams, ScheduleMessageResult, } from "./types";
import { ScheduledStatus, } from "./types";

/** Raw `scheduled_messages` row. */
export interface ScheduledRow {
  id: string;
  chat_id: string;
  author_id: string;
  body: string;
  send_at: string;
  status: string;
}

/**
 * @param row
 * @returns {ScheduledMessage}
 */
function toRecord(row: ScheduledRow,): ScheduledMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    authorId: row.author_id,
    body: row.body,
    sendAt: row.send_at,
    status: row.status,
  };
}

/**
 * Park a message body for future delivery. A `sendAt` in the past is
 * accepted — the dispatcher treats it as due on the next pass (AC2).
 * @param database
 * @param params
 * @returns {Promise<ScheduleMessageResult>}
 */
export async function scheduleMessage(
  database: Kysely<DB>,
  params: ScheduleMessageParams,
): Promise<ScheduleMessageResult> {
  const body = params.body.trim();
  if (body.length === 0) {
    return { code: "bad_request", message: "Message body cannot be empty", };
  }
  const sendAt = toDate(params.sendAt,);
  if (Number.isNaN(sendAt.getTime(),)) {
    return { code: "bad_request", message: "sendAt must be a valid ISO-8601 instant", };
  }

  const id = uid();
  await database
    .insertInto("scheduled_messages",)
    .values({
      id,
      chat_id: params.chatId,
      author_id: params.authorId,
      body,
      send_at: sendAt.toISOString(),
      status: ScheduledStatus.Pending,
    },)
    .execute();

  return {
    ok: true,
    scheduled: {
      id,
      chatId: params.chatId,
      authorId: params.authorId,
      body,
      sendAt: sendAt.toISOString(),
      status: ScheduledStatus.Pending,
    },
  };
}

/**
 * Every parked message in a chat, oldest send_at first (newest statuses
 * included so the composer can show canceled/sent history).
 * @param database
 * @param chatId
 * @returns {Promise<ScheduledMessage[]>}
 */
export async function listScheduledMessages(
  database: Kysely<DB>,
  chatId: string,
): Promise<ScheduledMessage[]> {
  const rows = await database
    .selectFrom("scheduled_messages",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .orderBy("send_at", "asc",)
    .execute() as ScheduledRow[];
  return rows.map(toRecord,);
}

/**
 * Cancel a parked message inside the caller's authorized chat. Both the
 * author check and the chat binding must hold: `chatId` is the chat the
 * caller was already granted access to, and every read and write is scoped
 * to it, so a row id that lives in another chat is indistinguishable from
 * one that does not exist (`not_found`, never `forbidden` — a `forbidden`
 * would confirm the id is real). Only the author may cancel, and only while
 * the row is still pending — a dispatched message is immutable history.
 * @param database
 * @param opts
 * @param opts.chatId Authorized chat; the row must belong to it.
 * @param opts.id
 * @param opts.requesterId
 * @returns {Promise<{ ok: true; canceled: boolean } | { code: "not_found" | "forbidden"; message: string }>}
 */
export async function cancelScheduledMessage(
  database: Kysely<DB>,
  opts: { chatId: string; id: string; requesterId: string },
): Promise<{ ok: true; canceled: boolean } | { code: "not_found" | "forbidden"; message: string }> {
  const row = await database
    .selectFrom("scheduled_messages",)
    .select(["author_id", "status",],)
    .where("id", "=", opts.id,)
    .where("chat_id", "=", opts.chatId,)
    .executeTakeFirst();

  if (!row) { return { code: "not_found", message: "Scheduled message not found", }; }
  // Still distinct from `not_found`: the row sits in a chat the caller can
  // already see, so that chat's list endpoint has revealed it already.
  if (row.author_id !== opts.requesterId) {
    return { code: "forbidden", message: "Not the author of this scheduled message", };
  }
  if (row.status !== ScheduledStatus.Pending) { return { ok: true, canceled: false, }; }

  await database
    .updateTable("scheduled_messages",)
    .set({ status: ScheduledStatus.Canceled, },)
    .where("id", "=", opts.id,)
    .where("chat_id", "=", opts.chatId,)
    .execute();
  return { ok: true, canceled: true, };
}

/**
 * Pending rows whose `send_at` has arrived, oldest first. Index-backed by
 * `(status, send_at)`; the dispatcher calls this once per cron pass.
 * @param database
 * @param now
 * @returns {Promise<ScheduledRow[]>}
 */
export async function selectDueScheduledMessages(
  database: Kysely<DB>,
  now: Date,
): Promise<ScheduledRow[]> {
  const rows = await database
    .selectFrom("scheduled_messages",)
    .selectAll()
    .where("status", "=", ScheduledStatus.Pending,)
    .where("send_at", "<=", now.toISOString(),)
    .orderBy("send_at", "asc",)
    .execute();
  return rows as ScheduledRow[];
}

/**
 * Flip a dispatched row to `sent`. Guarded on `status = pending` so a
 * concurrent pass cannot double-mark.
 * @param database
 * @param id
 * @returns {Promise<void>}
 */
export async function markScheduledSent(database: Kysely<DB>, id: string,): Promise<void> {
  await database
    .updateTable("scheduled_messages",)
    .set({ status: ScheduledStatus.Sent, },)
    .where("id", "=", id,)
    .where("status", "=", ScheduledStatus.Pending,)
    .execute();
}
