// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Reminder slice of chat state (TASK-scheduled-messages-reminders).
 * A pending reminder as returned by `GET /api/v1/reminders`.
 */
export interface ReminderRow {
  id: string;
  messageId: string;
  userId: string;
  remindAt: string;
}

export interface ReminderState {
  /** Message id whose reminder ladder is open; null when closed. */
  _reminderFor: string | null;
  /** The caller's pending reminders. */
  _reminders: ReminderRow[];

  /**
   * @param messageId - Message to arm a reminder on
   * @returns {void}
   */
  openReminderPicker(messageId: string,): void;
  /** @returns {void} */
  closeReminderPicker(): void;
  /**
   * @param minutes - Horizon offset from now
   * @returns {Promise<void>}
   */
  armReminder(minutes: number,): Promise<void>;
  /** @returns {Promise<void>} */
  loadReminders(): Promise<void>;
  /**
   * @param id - Reminder to cancel
   * @returns {Promise<void>}
   */
  cancelReminder(id: string,): Promise<void>;
}
