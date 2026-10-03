// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Scheduled-send slice of chat state (TASK-scheduled-messages-reminders).
 * A parked message as returned by `GET /api/v1/chats/:chatId/scheduled`.
 */
export interface ScheduledRow {
  id: string;
  chatId: string;
  authorId: string;
  body: string;
  sendAt: string;
  status: string;
}

export interface ScheduledState {
  /** Schedule picker open/closed. */
  _scheduleOpen: boolean;
  /** Raw `<input type=datetime-local>` value (local wall time). */
  _scheduleAt: string;
  /** Parked messages for the active chat. */
  _scheduled: ScheduledRow[];
  /** True while a schedule POST is in flight (button disable guard). */
  _scheduling: boolean;

  /** @returns {void} */
  toggleSchedulePicker(): void;
  /** @returns {void} */
  closeSchedulePicker(): void;
  /** @returns {Promise<void>} */
  scheduleDraft(): Promise<void>;
  /** @returns {Promise<void>} */
  loadScheduled(): Promise<void>;
  /**
   * @param id - Parked message to cancel
   * @returns {Promise<void>}
   */
  cancelScheduled(id: string,): Promise<void>;
}
