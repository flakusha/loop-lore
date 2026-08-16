// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
  _autoFired: false,
  _lastAutoFireAt: 0,
  _consecutiveAutoFires: 0,

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
    // Mark this send as automated so the `user` event trigger does not
    // re-fire on the message this command produces.
    this._autoFired = true;
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

  /**
   * Fire `user`/`ai` event-triggered quick replies with a loop guard.
   *
   * Guards:
   * - Never fire while another automated send is in flight (`_autoFired`).
   * - Minimum interval between automated sends (rate limit).
   * - Cap on consecutive automated sends; automation pauses until a
   *   human-initiated send resets the counter. This breaks the
   *   ai-trigger → send → response → ai-trigger feedback loop.
   */
  async fireAutoQuickReplies(trigger: "user" | "ai",) {
    if (!this.activeChat) { return; }
    if (this._autoFired) { return; }
    if (this._consecutiveAutoFires >= AUTO_FIRE_MAX_CONSECUTIVE) { return; }

    const now = Date.now();
    if (now - this._lastAutoFireAt < AUTO_FIRE_MIN_INTERVAL_MS) { return; }
    this._lastAutoFireAt = now;

    const commands: string[] = [];
    for (const qr of this._quickReplies) {
      if (qr.trigger === trigger && qr.command) { commands.push(qr.command,); }
    }

    for (const command of commands) {
      await this.executeQuickReply(command,);
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

/** Min ms between two automated (event-triggered) sends. */
export const AUTO_FIRE_MIN_INTERVAL_MS = 3000;
/** Max consecutive automated sends before automation pauses for a human send. */
export const AUTO_FIRE_MAX_CONSECUTIVE = 5;
