import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";
import type { ChatState, QuickReplyButton, } from "./types";

/**
 * Quick-reply button sets — composed into the chat store.
 *
 * 0.1.0 Quick Win item 1 (matrix gap G22): per-chat button sets rendered above
 * the message input. Each button runs a slash command (server-side dispatch
 * via the existing user-message path). Optional `trigger` events fire
 * automatically: "startup" runs once per chat open; "user"/"ai" are reserved
 * for follow-up event automation (avoid auto-send loops without rate limits).
 */
export const chatQuickReplies: Partial<ChatState> & ThisType<ChatState> = {
  _quickReplies: [] as QuickReplyButton[],
  _quickRepliesDirty: false,
  _startupFiredChat: null as string | null,

  /** Parse the active chat's quick_replies JSON column into state. */
  loadQuickReplies() {
    const chat = this.chats.find((c,) => c.id === this.activeChat);
    const raw = chat?.quick_replies ?? null;
    this._quickReplies = raw ? jsonParseOr<QuickReplyButton[]>(raw, [],) : [];
  },

  /** Send a quick-reply command as a user message (reuses the send path). */
  async executeQuickReply(command: string,) {
    if (!command || !this.activeChat) { return; }
    const input = this.$refs?.messageInput as HTMLTextAreaElement | undefined;
    if (input) {
      input.value = command;
    }
    await this.sendMessage();
  },

  /** Run configured startup-triggered quick replies once per chat open. */
  async fireStartupQuickReplies() {
    if (!this.activeChat || this._startupFiredChat === this.activeChat) { return; }
    this._startupFiredChat = this.activeChat;
    for (const qr of this._quickReplies) {
      if (qr.trigger === "startup" && qr.command) {
        // Sequential execution — each command is an independent send.
        await this.executeQuickReply(qr.command,);
      }
    }
  },

  /** Persist the quick-reply button set for the active chat. */
  async saveQuickReplies() {
    if (!this.activeChat || !this._quickRepliesDirty) { return; }
    const body: Record<string, unknown> = {
      quickReplies: this._quickReplies.length > 0 ? this._quickReplies : null,
    };
    const res = await apiFetch(`/api/v1/chats/${this.activeChat}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(body,),
    },);
    if (res.ok) {
      this._quickRepliesDirty = false;
      const chat = this.chats.find((c,) => c.id === this.activeChat);
      if (chat) {
        chat.quick_replies = body.quickReplies ? jsonBody(body.quickReplies,) : null;
      }
      this.$dispatch?.("show-toast", {
        type: "success",
        message: t("toasts.quickRepliesSaved",),
      },);
    } else {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.quickRepliesSaveFailed",), },);
    }
  },
};
