// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "chat-actions", },);

export type MessageAiAction = "summarize" | "action-items" | "explain";

export const messageTools: Partial<ChatState> & ThisType<ChatState> = {
  async forwardMessage(msgId: string,) {
    log.info("forwardMessage", { messageId: msgId, },);
    const sourceChat = this.activeChat;
    if (!sourceChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChat",), },);
      return;
    }
    const targetChatId = prompt(t("chats.forwardTargetPrompt",),)?.trim() ?? "";
    if (!targetChatId) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${sourceChat}/messages/${msgId}/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ targetChatId, },),
        idempotencyKey: true,
      },);
      if (res.ok) {
        const body = await res.json() as { droppedAttachments?: number };
        this.$dispatch?.("show-toast", {
          type: "success",
          message: (body.droppedAttachments ?? 0) > 0
            ? t("toasts.messageForwardedDropped",)
            : t("toasts.messageForwarded",),
        },);
      } else if (res.status === 400) {
        this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.messageForwardEmpty",), },);
      } else {
        const err = await res.json().catch(() => ({} as { message?: string })) as { message?: string };
        this.$dispatch?.("show-toast", {
          type: "error",
          message: err.message ?? t("toasts.failedForwardMessage",),
        },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorForwarding",), },);
    }
  },
  async runMessageAiAction(msgId: string, action: MessageAiAction,) {
    log.info("runMessageAiAction", { messageId: msgId, action, },);
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChat",), },);
      return;
    }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/messages/${msgId}/ai-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ action, },),
      },);
      if (res.ok) {
        const body = await res.json() as { result?: string };
        this.$dispatch?.("show-toast", {
          type: "info",
          message: (body.result ?? "").slice(0, 300,) || t("toasts.aiActionEmpty",),
        },);
      } else if (res.status === 503) {
        this.$dispatch?.("show-toast", { type: "info", message: t("toasts.aiActionUnavailable",), },);
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedAiAction",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorAiAction",), },);
    }
  },
};
