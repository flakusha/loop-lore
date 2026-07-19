import { jsonBody, jsonParseOr, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat-activity", },);

export const chatActivity: Partial<ChatState> & ThisType<ChatState> = {
  _unseenCounts: {},
  _activityEventSource: null as EventSource | null,

  connectActivitySSE() {
    this.disconnectActivitySSE();

    const streamUrl = "/api/activity/stream";
    const activitySource = new EventSource(streamUrl,);
    this._activityEventSource = activitySource;

    activitySource.addEventListener("activity", (event: MessageEvent,) => {
      const data = jsonParseOr<{ chats?: Record<string, { unseenCount: number; chatName: string }> }>(
        event.data,
        {},
      );
      try {
        const chats: Record<string, { unseenCount: number; chatName: string }> = data.chats ?? {};

        const counts: Record<string, number> = {};
        for (const [chatId, entry,] of Object.entries(chats,)) {
          counts[chatId] = entry.unseenCount || 0;
        }
        this._unseenCounts = counts;

        const active = this.activeChat;
        for (const [chatId, entry,] of Object.entries(chats,)) {
          if (chatId === active || !entry.unseenCount) { continue; }
          this.$dispatch?.("show-toast", {
            type: "info",
            message: `${entry.chatName}: ${entry.unseenCount} new message${entry.unseenCount === 1 ? "" : "s"}`,
          },);
        }
      } catch {
        /* malformed event, skip */
      }
    },);

    activitySource.addEventListener("stream-error", () => {
      log.warn("activity SSE stream error, will auto-reconnect",);
    },);

    activitySource.addEventListener("error", () => {
      if (activitySource.readyState === EventSource.CLOSED) {
        log.debug("activity SSE connection closed",);
      }
    },);
  },

  disconnectActivitySSE() {
    if (!this._activityEventSource) {
      return;
    }

    this._activityEventSource.close();
    this._activityEventSource = null;
  },

  async markChatAsRead(chatId: string,) {
    const messages = this.messages;
    if (messages.length === 0) { return; }

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage?.id) { return; }

    try {
      await apiFetch(`/api/chats/${chatId}/mark-read`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ messageId: latestMessage.id, },),
      },);

      const counts = this._unseenCounts;
      counts[chatId] = 0;
      this._unseenCounts = { ...counts, };
    } catch {
      /* non-critical, retry on next poll */
    }
  },

  getUnseenCount(chatId: string,): number {
    return this._unseenCounts[chatId] ?? 0;
  },
};
