// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { ErrorEvent, } from "../../validation/schemas/responses";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";
import { log as rootLog, } from "./logger";
import { trackTelemetry, } from "./telemetry";
import type { ChatState, } from "./types";
import { parseOr, } from "./validation";

const log = rootLog.child({ module: "chat", },);
const getDOMPurify = () => (globalThis as any).__DOMPurify as { sanitize(html: string,): string } | undefined;

export const chatGenerations: Partial<ChatState> & ThisType<ChatState> = {
  connectGenerationSSE(chatId: string,) {
    if (this._generationEventSource) {
      this._generationEventSource.close();
    }
    this.isGenerating = true;
    const url = `/api/generation/stream/${chatId}`;
    const es = new EventSource(url,);
    this._generationEventSource = es;
    // Stale-stream guard: handlers close over the chat this stream belongs to
    // and must not write shared stream state after the user switched chats.
    const isStale = () => this.activeChat !== chatId;

    es.addEventListener("stream-update", (event: MessageEvent,) => {
      if (isStale()) { return; }
      this._streamContent = event.data;
      this.renderStreamContainer();
      this.activeAttemptId = chatId;
    },);

    es.addEventListener("tool_call", (event: MessageEvent,) => {
      if (isStale()) { return; }
      this._streamToolCalls.push(event.data,);
      this.renderStreamContainer();
    },);

    es.addEventListener("stream-done", () => {
      if (!isStale()) {
        trackTelemetry("generation.completed", { chatId, },);
      }
      this.isGenerating = false;
      this.activeAttemptId = null;
      this.generationDetail = null;
      this._streamToolCalls = [];
      this._streamContent = "";
      this._cleanupSSE();
      if (isStale()) { return; }
      void (async () => {
        try {
          await this.loadMessages();
          await this.fireAutoQuickReplies("ai",);
        } catch {
          /* non-critical */
        }
      })();
    },);

    es.addEventListener("stream-error", (event: MessageEvent,) => {
      log.warn("generation error via SSE", { chatId, error: event.data, },);
      this.isGenerating = false;
      this.activeAttemptId = null;
      this.generationDetail = null;
      this._streamToolCalls = [];
      this._streamContent = "";
      this._cleanupSSE();
      if (isStale()) { return; }
      try {
        const data = parseOr(ErrorEvent, jsonParseOr(event.data, null,), {},);
        this.$dispatch?.("show-toast", { type: "error", message: data.error ?? t("toasts.generationFailed",), },);
      } catch {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.generationFailed",), },);
      }
    },);

    es.addEventListener("error", () => {
      if (es.readyState !== EventSource.CLOSED) { return; }
      log.debug("SSE connection closed permanently", { chatId, },);
      this.isGenerating = false;
      this._cleanupSSE();
    },);
  },

  async checkGenerationStatus(chatId: string,) {
    log.debug("checkGenerationStatus", { chatId, },);
    try {
      const response = await apiFetch(`/api/generation/status/${chatId}`,);
      const data = await response.json();
      const hadActiveAttempt = !!this.activeAttemptId;

      if (data.isActive) {
        this.isGenerating = true;
        this.activeAttemptId = data.attemptId;
        this.generationDetail = data.generation
          ? {
            attemptId: data.generation.attemptId,
            status: data.generation.status,
            elapsedMs: data.generation.elapsedMs,
            chunksReceived: data.generation.chunksReceived,
            charsReceived: data.generation.charsReceived,
          }
          : null;
        const detail = this.generationDetail;
        if (detail) {
          const elapsed = detail.elapsedMs ? ` (${Math.round(Number(detail.elapsedMs,) / 1000,)}s)` : "";
          const chars = detail.charsReceived ? ` · ${detail.charsReceived} chars` : "";
          this.generationLabel = `Generating${elapsed}${chars}`;
        }
      } else if (hadActiveAttempt) {
        trackTelemetry("generation.completed", { chatId, },);
        this.isGenerating = false;
        this.activeAttemptId = null;
        this.generationDetail = null;
        await this.loadMessages();
      } else if (!this.isGenerating) {
        this.activeAttemptId = null;
        this.generationDetail = null;
      }
    } catch (error) {
      // Recovery poll is best-effort; surface the reason instead of swallowing it.
      log.debug("checkGenerationStatus failed", { chatId, error: String(error,), },);
    }
  },

  async cancelGeneration() {
    log.info("cancelGeneration", { chatId: this.activeChat, },);
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChatToCancel",), },);
      return;
    }
    try {
      const response = await apiFetch("/api/generation/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          chatId: this.activeChat,
          reason: "user_cancel",
          source: "user",
          detail: "User cancelled generation",
        },),
      },);
      const data = await response.json();
      if (response.ok && data.ok) {
        this.isGenerating = false;
        this.activeAttemptId = null;
        this.$dispatch?.("show-toast", { type: "info", message: t("toasts.generationCancelled",), },);
      } else {
        this.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? t("toasts.failedCancelGeneration",),
        },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorCancellingGeneration",), },);
    }
  },

  renderStreamContainer() {
    const container = document.querySelector("#stream-container",);
    if (!container) { return; }
    const DOMPurify = getDOMPurify();
    const html = `${this._streamToolCalls.join("",)}${this._streamContent}`;
    if (DOMPurify) {
      container.innerHTML = DOMPurify.sanitize(html,);
      return;
    }
    // Fail-safe: sanitizer unavailable — render as text, never raw HTML.
    const pre = document.createElement("pre",);
    pre.textContent = html;
    container.replaceChildren(pre,);
  },

  _cleanupSSE() {
    if (this._generationEventSource) {
      this._generationEventSource.close();
      this._generationEventSource = null;
    }
    this._streamToolCalls = [];
    this._streamContent = "";
    const container = document.querySelector("#stream-container",);
    if (container) { container.replaceChildren(); }
  },
};
