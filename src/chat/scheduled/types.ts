// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Scheduled messages + reminders — shared types
 * (TASK-scheduled-messages-reminders).
 */
import type { ServiceError, } from "../service/types";

/** Lifecycle of a `scheduled_messages` row. */
export const ScheduledStatus = {
  /** Waiting for `send_at`. */
  Pending: "pending",
  /** Delivered as a `messages` row. */
  Sent: "sent",
  /** Author withdrew it before dispatch. */
  Canceled: "canceled",
} as const;
/** */
export type ScheduledStatus = (typeof ScheduledStatus)[keyof typeof ScheduledStatus];

/** A parked message as returned by the routes. */
export interface ScheduledMessage {
  id: string;
  chatId: string;
  authorId: string;
  body: string;
  sendAt: string;
  status: string;
}

/** A pending reminder as returned by the routes. */
export interface MessageReminder {
  id: string;
  messageId: string;
  userId: string;
  remindAt: string;
}

/** Input for parking a message for future delivery. */
export interface ScheduleMessageParams {
  chatId: string;
  authorId: string;
  body: string;
  /**
   * ISO-8601 instant; must parse. A past value is legal — the dispatcher
   * treats it as due immediately (ticket AC2).
   */
  sendAt: string;
}

/** Input for arming a reminder on an existing message. */
export interface CreateReminderParams {
  messageId: string;
  userId: string;
  /** ISO-8601 instant; must parse. A past value fires on the next pass. */
  remindAt: string;
}

/** */
export type ScheduleMessageResult = { ok: true; scheduled: ScheduledMessage } | ServiceError;

/** */
export type CreateReminderResult = { ok: true; reminder: MessageReminder } | ServiceError;
