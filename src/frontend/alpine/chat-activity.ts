// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Chat activity — unseen counts and mark-read.
//
// SSE + polling is handled by NotificationsManager (notifications.ts).
// This module delegates to it for unseen counts and mark-read,
// avoiding a duplicate EventSource to /api/activity/stream.
import { jsonBody, } from "./json";
import type { ChatState, } from "./types";

/** Public API surface we need from the NotificationsManager singleton. */
interface ActivityManager {
  getUnseenCount(chatId: string,): number;
  getAllUnseen(): Record<string, number>;
  clearUnseen(chatId: string,): void;
  markRead(chatId: string,): Promise<void>;
  setActiveChat(chatId: string | null,): void;
}

/** Typed accessor for the global NotificationsManager singleton. */
function getManager(): ActivityManager | undefined {
  const g = globalThis;
  if (g && typeof g === "object" && "notifications" in g) {
    const mgr = g.notifications;
    if (mgr && typeof mgr === "object" && "getUnseenCount" in mgr) {
      return mgr as ActivityManager;
    }
  }
  return undefined;
}

export const chatActivity: Partial<ChatState> & ThisType<ChatState> = {
  _unseenCounts: {},

  async markChatAsRead(chatId: string,) {
    const messages = this.messages;
    if (messages.length === 0) { return; }

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage?.id) { return; }

    try {
      await apiFetch(`/api/v1/chats/${chatId}/mark-read`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ messageId: latestMessage.id, },),
      },);

      const mgr = getManager();
      if (mgr) {
        mgr.clearUnseen(chatId,);
        this._unseenCounts = mgr.getAllUnseen();
      } else {
        const counts = this._unseenCounts;
        counts[chatId] = 0;
        this._unseenCounts = { ...counts, };
      }
    } catch {
      /* non-critical, retry on next poll */
    }
  },

  getUnseenCount(chatId: string,): number {
    const mgr = getManager();
    return mgr ? mgr.getUnseenCount(chatId,) : (this._unseenCounts[chatId] ?? 0);
  },
};
