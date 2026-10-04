// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Scheduled-send + reminder actions (TASK-scheduled-messages-reminders).
 *
 * Both halves of one feature: the composer's clock button parks the CURRENT
 * draft instead of posting it now (delivered later by the `chat.scheduled`
 * cron pass), and the message context menu arms a reminder on an existing
 * message. They share the same endpoints, the same toast surface and the
 * same load-on-open lifecycle, so they ship as one module.
 *
 * The reminder horizon is a fixed offset ladder because the context menu
 * has no room for a datetime input; free-form scheduling lives in the
 * composer picker.
 */
import { toDate, } from "../../../utils/date";
import { requireActiveChat, } from "../chat-guards";
import type { ReminderState, } from "../chat-types/reminder-state";
import type { ScheduledState, } from "../chat-types/scheduled-state";
import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "scheduling", },);

type SchedulingCtx = ChatState & ScheduledState & ReminderState;

/**
 * Convert a `<input type="datetime-local">` value (local wall time, no zone)
 * to the ISO instant the API stores. Returns null for an empty/invalid
 * value so callers can reject without guessing a timezone.
 * @param value
 * @returns {string | null}
 */
export function localInputToIso(value: string,): string | null {
  if (!value) { return null; }
  const parsed = toDate(value,);
  return Number.isNaN(parsed.getTime(),) ? null : parsed.toISOString();
}

/**
 * Reminder horizons offered in the context menu, in minutes. Deliberately
 * short: a reminder longer than a day is a calendar feature, not a nudge.
 */
export const REMINDER_OFFSET_MINUTES = [10, 60, 1440,] as const;

export const schedulingActions: Partial<ScheduledState & ReminderState> & ThisType<SchedulingCtx> = {
  _scheduleOpen: false,
  _scheduleAt: "",
  _scheduled: [],
  _scheduling: false,
  _reminderFor: null,
  _reminders: [],

  /** @returns {void} */
  toggleSchedulePicker() {
    this._scheduleOpen = !this._scheduleOpen;
  },

  /** @returns {void} */
  closeSchedulePicker() {
    this._scheduleOpen = false;
  },

  /**
   * @param messageId
   * @returns {void}
   */
  openReminderPicker(messageId: string,) {
    this._reminderFor = messageId;
  },

  /** @returns {void} */
  closeReminderPicker() {
    this._reminderFor = null;
  },

  /**
   * Read the draft off the composer textarea and park it for `send_at`.
   * Does NOT clear the draft — the user keeps editing until it lands.
   * @returns {Promise<void>}
   */
  async scheduleDraft() {
    if (!requireActiveChat(this,)) { return; }
    if (this._scheduling) { return; }

    const sendAt = localInputToIso(this._scheduleAt,);
    if (!sendAt) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("scheduled.pickTime",), },);
      return;
    }

    const input = document.querySelector<HTMLTextAreaElement>("[data-testid=message-input]",);
    const body = (input?.value ?? "").trim();
    if (!body) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("scheduled.emptyDraft",), },);
      return;
    }

    this._scheduling = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/scheduled`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ body, sendAt, },),
      },);

      if (res.ok) {
        this._scheduleOpen = false;
        this._scheduleAt = "";
        this.$dispatch?.("show-toast", { type: "success", message: t("scheduled.scheduled",), },);
        await this.loadScheduled();
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: t("scheduled.failed",), },);
      }
    } catch (error) {
      log.warn("scheduleDraft failed", { error: String(error,), },);
      this.$dispatch?.("show-toast", { type: "error", message: t("scheduled.failed",), },);
    } finally {
      this._scheduling = false;
    }
  },

  /** @returns {Promise<void>} */
  async loadScheduled() {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/scheduled`,);
      if (!res.ok) { return; }
      const body = await res.json();
      this._scheduled = (body.data as ScheduledState["_scheduled"]) ?? [];
    } catch (error) {
      log.warn("loadScheduled failed", { error: String(error,), },);
    }
  },

  /**
   * @param id - Parked message to cancel
   * @returns {Promise<void>}
   */
  async cancelScheduled(id: string,) {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/scheduled/${id}`, {
        method: "DELETE",
      },);

      if (res.ok) { await this.loadScheduled(); }
    } catch (error) {
      log.warn("cancelScheduled failed", { error: String(error,), },);
    }
  },

  /**
   * Arm a reminder `minutes` from now on the menu's open message.
   * @param minutes
   * @returns {Promise<void>}
   */
  async armReminder(minutes: number,) {
    const messageId = this._reminderFor;
    this._reminderFor = null;
    if (!messageId) { return; }

    const remindAt = toDate(Date.now() + minutes * 60_000,).toISOString();
    try {
      const res = await apiFetch("/api/v1/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ messageId, remindAt, },),
      },);

      if (res.ok) {
        this.$dispatch?.("show-toast", { type: "success", message: t("reminders.armed",), },);
        await this.loadReminders();
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: t("reminders.failed",), },);
      }
    } catch (error) {
      log.warn("armReminder failed", { error: String(error,), },);
      this.$dispatch?.("show-toast", { type: "error", message: t("reminders.failed",), },);
    }
  },

  /** @returns {Promise<void>} */
  async loadReminders() {
    try {
      const res = await apiFetch("/api/v1/reminders",);
      if (!res.ok) { return; }
      const body = await res.json();
      this._reminders = (body.data as ReminderState["_reminders"]) ?? [];
    } catch (error) {
      log.warn("loadReminders failed", { error: String(error,), },);
    }
  },

  /**
   * @param id - Reminder to cancel
   * @returns {Promise<void>}
   */
  async cancelReminder(id: string,) {
    try {
      const res = await apiFetch(`/api/v1/reminders/${id}`, { method: "DELETE", },);
      if (res.ok) { await this.loadReminders(); }
    } catch (error) {
      log.warn("cancelReminder failed", { error: String(error,), },);
    }
  },
};
