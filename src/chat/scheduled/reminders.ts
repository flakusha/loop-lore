// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message reminders — CRUD half (TASK-scheduled-messages-reminders).
 *
 * A reminder is (message, user): the same user can arm one reminder per
 * message, re-arming replaces the existing row via the unique index. Rows
 * are deleted once fired, which is what makes a reminder fire exactly once.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { toDate, } from "../../utils/date";
import type { CreateReminderParams, CreateReminderResult, MessageReminder, } from "./types";

/** Raw `message_reminders` row joined to its parent message. */
interface ReminderRow {
  id: string;
  message_id: string;
  user_id: string;
  remind_at: string;
}

/** Due reminder joined to the chat it points at (notification link needs it). */
export interface DueReminder extends ReminderRow {
  chat_id: string;
  actor_id: string;
}

/**
 * @param row
 * @returns {MessageReminder}
 */
function toRecord(row: ReminderRow,): MessageReminder {
  return {
    id: row.id,
    messageId: row.message_id,
    userId: row.user_id,
    remindAt: row.remind_at,
  };
}

/**
 * Arm (or re-arm) a reminder on a message. The message must exist; a
 * dangling `messageId` is a `not_found` rather than a silent no-op.
 * @param database
 * @param params
 * @returns {Promise<CreateReminderResult>}
 */
export async function createReminder(
  database: Kysely<DB>,
  params: CreateReminderParams,
): Promise<CreateReminderResult> {
  const at = toDate(params.remindAt,);
  if (Number.isNaN(at.getTime(),)) {
    return { code: "bad_request", message: "remindAt must be a valid ISO-8601 instant", };
  }

  const message = await database
    .selectFrom("messages",)
    .select("id",)
    .where("id", "=", params.messageId,)
    .executeTakeFirst();
  if (!message) { return { code: "not_found", message: "Message not found", }; }

  const remindAt = at.toISOString();
  const existing = await database
    .selectFrom("message_reminders",)
    .select("id",)
    .where("message_id", "=", params.messageId,)
    .where("user_id", "=", params.userId,)
    .executeTakeFirst();

  if (existing) {
    await database
      .updateTable("message_reminders",)
      .set({ remind_at: remindAt, },)
      .where("id", "=", existing.id,)
      .execute();
    return {
      ok: true,
      reminder: { id: existing.id, messageId: params.messageId, userId: params.userId, remindAt, },
    };
  }

  const id = uid();
  await database
    .insertInto("message_reminders",)
    .values({ id, message_id: params.messageId, user_id: params.userId, remind_at: remindAt, },)
    .execute();
  return { ok: true, reminder: { id, messageId: params.messageId, userId: params.userId, remindAt, }, };
}

/**
 * A user's pending reminders, soonest first.
 * @param database
 * @param userId
 * @returns {Promise<MessageReminder[]>}
 */
export async function listReminders(
  database: Kysely<DB>,
  userId: string,
): Promise<MessageReminder[]> {
  const rows = await database
    .selectFrom("message_reminders",)
    .selectAll()
    .where("user_id", "=", userId,)
    .orderBy("remind_at", "asc",)
    .execute() as ReminderRow[];
  return rows.map(toRecord,);
}

/**
 * Cancel one of a user's reminders.
 * @param database
 * @param opts
 * @param opts.id
 * @param opts.userId
 * @returns {Promise<{ ok: true; deleted: number } | { code: "not_found"; message: string }>}
 */
export async function cancelReminder(
  database: Kysely<DB>,
  opts: { id: string; userId: string },
): Promise<{ ok: true; deleted: number } | { code: "not_found"; message: string }> {
  // Scoped by user_id so one user cannot cancel another's reminder.
  const result = await database
    .deleteFrom("message_reminders",)
    .where("id", "=", opts.id,)
    .where("user_id", "=", opts.userId,)
    .executeTakeFirst();
  const deleted = Number(result.numDeletedRows ?? 0,);
  if (deleted === 0) { return { code: "not_found", message: "Reminder not found", }; }
  return { ok: true, deleted, };
}

/**
 * Reminders whose `remind_at` has arrived, joined to the parent message for
 * the notification link. Deleted in the same pass as the notification, so
 * a second pass finds nothing.
 * @param database
 * @param now
 * @returns {Promise<DueReminder[]>}
 */
export async function selectDueReminders(
  database: Kysely<DB>,
  now: Date,
): Promise<DueReminder[]> {
  const rows = await database
    .selectFrom("message_reminders",)
    .innerJoin("messages", "messages.id", "message_reminders.message_id",)
    .select([
      "message_reminders.id",
      "message_reminders.message_id",
      "message_reminders.user_id",
      "message_reminders.remind_at",
      "messages.chat_id",
      "messages.actor_id",
    ],)
    .where("message_reminders.remind_at", "<=", now.toISOString(),)
    .orderBy("message_reminders.remind_at", "asc",)
    .execute();
  return rows as DueReminder[];
}

/**
 * Delete a fired reminder. Returns the number of rows removed so the
 * caller can report a pass that actually fired.
 * @param database
 * @param id
 * @returns {Promise<number>}
 */
export async function deleteFiredReminder(database: Kysely<DB>, id: string,): Promise<number> {
  const result = await database
    .deleteFrom("message_reminders",)
    .where("id", "=", id,)
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0,);
}
