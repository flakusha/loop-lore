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
import {
  findByIdempotencyKey,
  insertUserMessageWithRetry,
} from "../../routes/messages/swipe-race-insert";
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
  /**
   * Rows this pass tried and failed on. A failed scheduled row stays
   * `pending` and retries on the next tick; a failed reminder was already
   * deleted, so it is dropped. Either way the attempt is counted here so
   * the pass still reports what it lost.
   */
  failed: number;
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
 * @throws never - all errors are caught and counted in `DispatchSummary.failed`
 */
export async function dispatchDue(
  database: Kysely<DB>,
  config: Config,
  opts: { now?: Date; logger?: Logger } = {},
): Promise<DispatchSummary> {
  const now = opts.now ?? new Date();
  const log = (opts.logger ?? getLogger()).child({ module: "scheduled-dispatch", },);
  const summary: DispatchSummary = { sent: 0, held: 0, reminded: 0, failed: 0, };

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
    // Per-row isolation: a throw here (undecryptable body, actor row deleted
    // mid-flight, encryption misconfig) must not abort the pass. Rows are
    // selected send_at ASC, so an uncaught throw would put the same row first
    // on every future tick and starve every later due row forever.
    try {
      // Claim the idempotency key BEFORE inserting. A crash between a
      // successful insert and markScheduledSent leaves the row pending; the
      // next pass finds the key already claimed and heals the status instead
      // of inserting a second copy of the same delivery.
      const key = `scheduled:${row.id}`;
      if (await findByIdempotencyKey(database, row.chat_id, key,)) {
        await markScheduledSent(database, row.id,);
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
        idempotencyKey: key,
      },);
      await markScheduledSent(database, row.id,);
      summary.sent += 1;
    } catch (err) {
      // Left `pending` on purpose: it retries next tick.
      summary.failed += 1;
      log.warn("scheduled dispatch failed; row stays pending for retry", {
        scheduledId: row.id,
        chatId: row.chat_id,
        error: String(err,),
      },);
    }
  }

  const notifications = new NotificationService(database,);
  for (const reminder of await selectDueReminders(database, now,)) {
    // Same isolation as the scheduled loop: one undeliverable reminder must
    // not stop the ones behind it.
    try {
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
    } catch (err) {
      // The row is already deleted, so this one is dropped, not retried —
      // count it so the pass still reports what it lost.
      summary.failed += 1;
      log.warn("reminder dispatch failed", {
        reminderId: reminder.id,
        chatId: reminder.chat_id,
        error: String(err,),
      },);
    }
  }

  if (summary.sent > 0 || summary.held > 0 || summary.reminded > 0 || summary.failed > 0) {
    log.info("scheduled dispatch complete", { ...summary, },);
  }
  return summary;
}
