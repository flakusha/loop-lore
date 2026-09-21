// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat-variants", },);

export const chatVariants: Partial<ChatState> & ThisType<ChatState> = {
  _variantsOpen: false,
  _variantsLoading: false,
  _variantsFor: null as string | null,
  _variants: [] as { id: string; content: string }[],

  async openVariants(messageId: string,) {
    log.info("openVariants", { messageId, },);
    this._variantsFor = messageId;
    this._variantsOpen = true;
    this._variantsLoading = true;
    this._variants = [];
    try {
      const res = await apiFetch(`/api/v1/messages/${messageId}/variants`,);
      if (res.ok) {
        const data = await res.json() as { id: string; content: string }[];
        this._variants = Array.isArray(data,) ? data : [];
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedSwitchVariant",), },);
        this._variantsOpen = false;
        this._variantsFor = null;
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedSwitchVariant",), },);
      this._variantsOpen = false;
      this._variantsFor = null;
    } finally {
      this._variantsLoading = false;
    }
  },

  closeVariants() {
    this._variantsOpen = false;
    this._variantsLoading = false;
    this._variantsFor = null;
    this._variants = [];
  },

  // BE PUT /messages/:id/variant is stateless (returns the sibling at
  // index, persists nothing), so apply the selection locally as a preview
  // swap on the originating bubble instead of reloading the list.
  async selectVariantByIndex(messageId: string, index: number,) {
    log.info("selectVariantByIndex", { messageId, index, },);
    try {
      const res = await apiFetch(`/api/v1/messages/${messageId}/variant`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ variantIndex: index, },),
      },);
      if (!res.ok) {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedSwitchVariant",), },);
        return;
      }
      const selected = await res.json() as { id?: string; content?: string };
      const msg = this.messages.find((m,) => m.id === messageId);
      if (msg && typeof selected.content === "string") {
        msg.content = selected.content;
        msg.variantIndex = index;
      } else {
        await this.loadMessages();
      }
      this.closeVariants();
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedSwitchVariant",), },);
    }
  },

  async regenerateResponse() {
    log.info("regenerateResponse", { chatId: this.activeChat, },);
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChat",), },);
      return;
    }
    try {
      const response = await apiFetch("/api/v1/generation/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ chatId: this.activeChat, },),
      },);
      const data = await response.json();
      if (response.ok && data.ready) {
        this.$dispatch?.("show-toast", { type: "info", message: t("status.regeneratingResponse",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedRegenerate",), },);
    }
  },

  async regenerateVariant(messageId: string,) {
    log.info("regenerateVariant", { messageId, },);
    if (!this.activeChat) { return; }
    this.isGenerating = true;
    try {
      const res = await apiFetch("/api/v1/generation/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ chatId: this.activeChat, messageId, },),
      },);
      if (res.ok) {
        await this.loadMessages();
        this.$dispatch?.("show-toast", { type: "info", message: t("toasts.newVariantGenerated",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedRegenerateVariant",), },);
    } finally {
      this.isGenerating = false;
    }
  },

  async switchVariant(messageId: string, direction: number,) {
    log.info("switchVariant", { messageId, direction, },);
    const msg = this.messages.find((m,) => m.id === messageId);
    if (!msg?.totalVariants || msg.totalVariants <= 1) { return; }
    const newIdx = ((msg.variantIndex ?? 0) + direction + msg.totalVariants) % msg.totalVariants;
    await this.selectVariantByIndex(messageId, newIdx,);
  },

  async continueMessage(messageId: string,) {
    log.info("continueMessage", { messageId, chatId: this.activeChat, },);
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChat",), },);
      return;
    }
    const msgEl = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId,)}"]`,);
    const actorId = msgEl?.dataset.actorId ?? "unknown";
    try {
      const response = await apiFetch("/api/v1/generation/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ messageId, chatId: this.activeChat, actorId, },),
      },);
      const data = await response.json();
      if (!response.ok || !data.ok) {
        this.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? t("toasts.failedContinueMessage",),
        },);
        return;
      }
      this.continuingMessageId = messageId;
      this.isContinuing = true;
      this.isGenerating = true;
      if (msgEl) { msgEl.classList.add("continued",); }
      this.$dispatch?.("show-toast", { type: "info", message: t("status.continuingMessage",), },);
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorContinuingMessage",), },);
    }
  },

  async retryFromPoint(attemptId: string, step: number,) {
    log.info("retryFromPoint", { attemptId, step, chatId: this.activeChat, },);
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChat",), },);
      return;
    }
    try {
      const response = await apiFetch("/api/v1/generation/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ chatId: this.activeChat, attemptId, step, },),
      },);
      const data = await response.json();
      if (!response.ok || !data.ok) {
        this.$dispatch?.("show-toast", { type: "error", message: data.error ?? t("toasts.failedRetry",), },);
        return;
      }
      this.$dispatch?.("show-toast", {
        type: "info",
        message: data.resumeFromStep > 0
          ? t("status.resumingFromStep", {
            step: String(data.resumeFromStep + 1,),
            total: String(data.totalSteps,),
          },)
          : t("status.regeneratingResponse",),
      },);
      this.isGenerating = true;
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorDuringRetry",), },);
    }
  },
};
