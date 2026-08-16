// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type NotificationStatus, NotificationType, } from "../../db/enums-core";

/** A single notification as returned to clients. */
export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: NotificationStatus;
  data: string | null;
  createdAt: string;
}

/** Per-user notification preferences. */
export interface NotificationPreferences {
  enabled: Record<NotificationType, boolean>;
  mutedWorlds: string[];
}

export const DEFAULT_PREFS: NotificationPreferences = {
  enabled: {
    [NotificationType.Mention]: true,
    [NotificationType.QuestUpdate]: true,
    [NotificationType.ItemOffer]: true,
    [NotificationType.WorldEvent]: false,
    [NotificationType.ChatInvite]: true,
    [NotificationType.CharacterUpdate]: false,
    [NotificationType.GmAction]: true,
    [NotificationType.System]: true,
    [NotificationType.BlogPost]: true,
    [NotificationType.BlogComment]: true,
  },
  mutedWorlds: [],
};

/** Input for creating one notification. */
export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
  /** When set, a user who muted this world will not receive the notification. */
  worldId?: string;
}

/** Raw database row for the notifications table. */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: NotificationStatus;
  data: string | null;
  created_at: string;
}
