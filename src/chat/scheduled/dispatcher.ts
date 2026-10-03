// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Dispatcher for due scheduled messages + due reminders
 * (TASK-scheduled-messages-reminders). Driven by the `chat.scheduled`
 * cron job; also runnable directly from tests.
 *
 * Quiet hours reuse the existing `isInQuietHours` gate from
 * `src/chat/proactive/timing.ts` (the same helper the proactive-messaging
 * service gates on) rather than a second implementation. A row that is due
 * inside the window is HELD — left `pending` with its original `send_at` so
 * the next pass after the boundary delivers it. Nothing is dropped.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { NotificationType, } from "../../db/enums-core";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import type { Logger, } from "../../logger/types";
import { NotificationService, } from "../../notifications/service";
import { prepareContentStorage, } from "../../routes/messages/post";
import { insertUserMessageWithRetry, } from "../../routes/messages/swipe-race-insert";
import { isInQuietHours, } from "../proactive/timing";
import { deleteFiredReminder, selectDueReminders, } from "./reminders";
import { markScheduledSent, selectDueScheduledMessages, } from "./scheduled-messages";

/** Per-pass tallies returned to the cron job (and asserted in tests). */
export interface DispatchSummary {
  /** Rows written as `messages` rows this pass. */
  sent: number;
  /** Due rows held back by the quiet-hours gate. */
  held: number;
  /** Reminders notified this pass. */
  reminded: number;
}

/**
 * Quiet hours are per-chat (per proactive config), so a row is resolved
 * against its own chat's window. A chat with no window never holds.
 * @param database
 * @param opts
 * @param opts.chatId
 * @param opts.now
 * @returns {Promise<boolean>}
 */
async function chatIsQuiet(
  database: Kysely<DB>,
  opts: { chatId: string; now: Date },
): Promise<boolean> {
  const { chatId, now, } = opts;
  const rows = await database
    .selectFrom("proactive_messaging_config",)
    .select(["quiet_hours_start", "quiet_hours_end",],)
    .where("chat_id", "=", chatId,)
    .execute();
  return rows.some((r,) => isInQuietHours(r.quiet_hours_start, r.quiet_hours_end, now,));
}

/**
 * One dispatch pass: deliver every due scheduled message and fire every due
 * reminder. Safe to call on a schedule — rows already dispatched are no
 * longer selected.
 * @param database
 * @param config - Needed so a dispatched body goes through the same
 *   encrypt-at-rest pipeline an interactively-typed one does.
 * @param opts
 * @param opts.now - Injectable clock; defaults to the wall clock.
 * @param opts.logger
 * @returns {Promise<DispatchSummary>}
 */
export async function dispatchDue(
  database: Kysely<DB>,
  config: Config,
  opts: { now?: Date; logger?: Logger } = {},
): Promise<DispatchSummary> {
  const now = opts.now ?? new Date();
  const log = (opts.logger ?? getLogger()).child({ module: "scheduled-dispatch", },);
  const summary: DispatchSummary = { sent: 0, held: 0, reminded: 0, };

  // Quiet hours are per-chat; cache the verdict so N rows in one chat cost
  // one query rather than N.
  const quietVerdict = new Map<string, Promise<boolean>>();
  const isQuiet = (chatId: string,): Promise<boolean> => {
    const cached = quietVerdict.get(chatId,);
    if (cached) { return cached; }
    const verdict = chatIsQuiet(database, { chatId, now, },);
    quietVerdict.set(chatId, verdict,);
    return verdict;
  };

  for (const row of await selectDueScheduledMessages(database, now,)) {
    if (await isQuiet(row.chat_id,)) {
      summary.held += 1;
      continue;
    }
    // The author IS the message's actor: the parked body was written by the
    // same user who will appear as the speaker when it lands. Storage runs
    // through prepareContentStorage so a chat with encryptAtRest persists an
    // encrypted body, exactly as an interactively-typed message would.
    const stored = await prepareContentStorage(
      database,
      config,
      row.chat_id,
      row.author_id,
      row.body,
    );
    await insertUserMessageWithRetry(database, {
      id: crypto.randomUUID(),
      chatId: row.chat_id,
      actorId: row.author_id,
      parentId: null,
      storedContent: stored.storedContent,
      storedKeyId: stored.storedKeyId,
      storedPlaintext: stored.storedPlaintext,
      contentEncoding: stored.contentEncoding,
      idempotencyKey: `scheduled:${row.id}`,
    },);
    await markScheduledSent(database, row.id,);
    summary.sent += 1;
  }

  const notifications = new NotificationService(database,);
  for (const reminder of await selectDueReminders(database, now,)) {
    // Delete BEFORE notifying: a failed notification must not leave a row
    // that re-fires forever, and a successful one must fire exactly once.
    const removed = await deleteFiredReminder(database, reminder.id,);
    if (removed === 0) { continue; }
    await notifications.create({
      userId: reminder.user_id,
      type: NotificationType.System,
      title: "Reminder",
      body: "You asked to be reminded about this message.",
      link: `/views/chat?chatid=${encodeURIComponent(reminder.chat_id,)}`,
      data: { messageId: reminder.message_id, chatId: reminder.chat_id, },
    },);
    summary.reminded += 1;
  }

  if (summary.sent > 0 || summary.held > 0 || summary.reminded > 0) {
    log.info("scheduled dispatch complete", { ...summary, },);
  }
  return summary;
}
