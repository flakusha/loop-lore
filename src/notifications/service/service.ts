// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { NotificationType, } from "../../db/enums-core";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import {
  buildRecentEvents,
  createNotification,
  deleteNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./crud";
import {
  getPrefs as getPrefsDispatch,
  setPrefs as setPrefsDispatch,
} from "./prefs";
import type { NotificationInput, NotificationPreferences, NotificationRecord, } from "./types";

/** */
export class NotificationService {
  private readonly log = getLogger().child({ module: "notifications", },);

  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Read the user's notification preferences, merging over defaults.
   * @param userId
   * @returns the stored preferences merged over the defaults.
   */
  async getPrefs(userId: string,): Promise<NotificationPreferences> {
    return getPrefsDispatch(this.db, userId,);
  }

  /**
   * Merge and persist the user's notification preferences.
   * @param userId
   * @param patch
   * @param patch.enabled
   * @param patch.mutedWorlds
   * @returns the full preferences as persisted.
   */
  async setPrefs(
    userId: string,
    patch: { enabled?: Partial<Record<NotificationType, boolean>>; mutedWorlds?: string[] },
  ): Promise<NotificationPreferences> {
    return setPrefsDispatch(this.db, userId, patch,);
  }

  /**
   * Create a notification, skipping when the type is disabled for the user or
   * when the linked world is muted.
   * @param input
   * @returns nothing; a suppressed notification resolves without a row.
   */
  async create(input: NotificationInput,): Promise<void> {
    return createNotification(this.db, input,);
  }

  /**
   * Fire-and-forget variant: logs and drops on failure.
   * @param input
   * @returns nothing; the create runs detached.
   */
  emit(input: NotificationInput,): void {
    void this.create(input,).catch((error,) => {
      this.log.warn(
        "Failed to create notification",
        error instanceof Error ? { error: error.message, } : undefined,
      );
    },);
  }

  /**
   * Newest-first list, optionally unread only.
   * @param userId
   * @param unreadOnly
   * @returns the user's notifications, newest first.
   */
  async list(userId: string, unreadOnly = false,): Promise<NotificationRecord[]> {
    return listNotifications(this.db, userId, unreadOnly,);
  }

  /**
   * Count of unread notifications for a user.
   * @param userId
   * @returns how many of the user's notifications are still unread.
   */
  async getUnreadCount(userId: string,): Promise<number> {
    return getUnreadCount(this.db, userId,);
  }

  /**
   * Mark a single notification read (ownership-checked).
   * @param id
   * @param userId
   * @returns nothing; a foreign notification is left untouched.
   */
  async markRead(id: string, userId: string,): Promise<void> {
    return markNotificationRead(this.db, id, userId,);
  }

  /**
   * Mark every notification read for a user.
   * @param userId
   * @returns nothing; only that user's rows are flipped.
   */
  async markAllRead(userId: string,): Promise<void> {
    return markAllNotificationsRead(this.db, userId,);
  }

  /**
   * Delete a notification (ownership-checked).
   * @param id
   * @param userId
   * @returns nothing; a foreign notification is left in place.
   */
  async delete(id: string, userId: string,): Promise<void> {
    return deleteNotification(this.db, id, userId,);
  }

  /**
   * Build the `[Recent Events]` block injected into the LLM prompt so
   * characters stay aware of off-screen activity. Returns "" when empty.
   * @param userId
   * @param chatId
   * @returns the prompt block, or "" when the user has no recent notifications.
   */
  async buildRecentEventsContext(userId: string, chatId?: string,): Promise<string> {
    return buildRecentEvents(this.db, userId, chatId,);
  }
}
