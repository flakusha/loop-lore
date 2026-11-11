// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import type {
  ChatState,
} from "./types";

import {
  chatGenerationPolling,
} from "./chat-generation-polling";

import {
  ErrorEvent,
} from "../../validation/schemas/responses";

import {
  SANITIZE_CONFIG,
} from "./chat-utils/sanitize";

import {
  apiFetch,
} from "./htmx";

import {
  jsonBody,
  jsonParseOr,
} from "./json";

import {
  log as rootLog,
} from "./logger";

import {
  parseOr,
} from "./validation";

import {
  t,
} from "./i18n";

import {
  trackTelemetry,
} from "./telemetry";

const log = rootLog.child({ module: "chat", },);
const getDOMPurify = () => globalThis.__DOMPurify as { sanitize(html: string, config?: unknown,): string } | undefined;

export const chatGenerations: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * @param {string} chatId
   * @returns {void}
   */
  connectGenerationSSE(chatId: string,) {
    if (this._generationEventSource) {
      this._generationEventSource.close();
    }

    this.isGenerating = true;

    const url = `/api/v1/generation/stream/${chatId}`;

    const es = new EventSource(url,);

    this._generationEventSource = es;

    // Stale-stream guard: handlers close over the chat this stream belongs to
    // and must not write shared stream state after the user switched chats.
    const isStale = () => this.activeChat !== chatId;

    es.addEventListener("stream-update", (event: MessageEvent,) => {
      if (isStale()) {
        return;
      }

      this._streamContent = event.data;

      this.renderStreamContainer();

      this.activeAttemptId = chatId;
    },);

    es.addEventListener("tool_call", (event: MessageEvent,) => {
      if (isStale()) {
        return;
      }

      this._streamToolCalls.push(event.data,);

      this.renderStreamContainer();
    },);

    es.addEventListener("stream-done", () => {
      if (!isStale()) {
        trackTelemetry("generation.completed", {
          chatId,
        },);
      }

      this.isGenerating = false;

      this.activeAttemptId = null;

      this.generationDetail = null;

      this._streamToolCalls = [];

      this._streamContent = "";

      this._cleanupSSE();

      if (isStale()) {
        return;
      }

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
      log.warn("generation error via SSE", {
        chatId,
        error: event.data,
      },);

      this.isGenerating = false;

      this.activeAttemptId = null;

      this.generationDetail = null;

      this._streamToolCalls = [];

      this._streamContent = "";

      this._cleanupSSE();

      if (isStale()) {
        return;
      }

      try {
        const data = parseOr(ErrorEvent, jsonParseOr(event.data, null,), {},);

        this.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? t("toasts.generationFailed",),
        },);
      } catch {
        this.$dispatch?.("show-toast", {
          type: "error",
          message: t("toasts.generationFailed",),
        },);
      }
    },);

    es.addEventListener("error", () => {
      if (es.readyState !== EventSource.CLOSED) {
        return;
      }

      log.debug("SSE connection closed permanently", {
        chatId,
      },);

      this.isGenerating = false;
      this._cleanupSSE();
    },);
  },

  ...chatGenerationPolling,

  /**
   * @returns {Promise<void>}
   */
  async cancelGeneration() {
    log.info("cancelGeneration", {
      chatId: this.activeChat,
    },);

    if (!this.activeChat) {
      this.$dispatch?.("show-toast", {
        type: "warning",
        message: t("toasts.noActiveChatToCancel",),
      },);

      return;
    }

    try {
      const response = await apiFetch("/api/v1/generation/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: jsonBody(
          {
            chatId: this.activeChat,
            reason: "user_cancel",
            source: "user",
            detail: "User cancelled generation",
          },
        ),
      },);

      const data = await response.json();

      if (response.ok && data.ok) {
        this.$dispatch?.("show-toast", { type: "info", message: t("toasts.generationCancelled",), },);
      } else {
        this.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? t("toasts.failedCancelGeneration",),
        },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorCancellingGeneration",), },);
    } finally {
      // Local teardown must happen even when the server call fails — a stale
      // spinner or a still-open stream would block the composer until the
      // next stream-error / SSE reconnect. Closing the EventSource ends the
      // SSE locally; the server-side abort stops token emission. Stream
      // buffers are left intact so the partial bubble stays visible until
      // the next message load renders the persisted draft.
      this.isGenerating = false;
      this.activeAttemptId = null;
      this._generationEventSource?.close();
      this._generationEventSource = null;
    }
  },

  /**
   * @returns {void}
   */
  renderStreamContainer() {
    const container = document.querySelector("#stream-container",);
    if (!container) { return; }
    const DOMPurify = getDOMPurify();
    // Job-status line is plain server text (op/state/step identifiers); the
    // ⚙ prefix + div are the only markup and DOMPurify passes text through.
    const statusHtml = this._jobStatusLine
      ? `<div class="job-status-line">⚙ ${this._jobStatusLine}</div>`
      : "";

    const html = `${statusHtml}${this._streamToolCalls.join("",)}${this._streamContent}`;
    if (DOMPurify) {
      container.innerHTML = DOMPurify.sanitize(html, SANITIZE_CONFIG,);
      return;
    }

    // Fail-safe: sanitizer unavailable — render as text, never raw HTML.
    const pre = document.createElement("pre",);
    pre.textContent = html;
    container.replaceChildren(pre,);
  },

  /**
   * @returns {void}
   */
  _cleanupSSE() {
    if (this._generationEventSource) {
      this._generationEventSource.close();
      this._generationEventSource = null;
    }

    this._streamToolCalls = [];
    this._streamContent = "";
    this._jobStatusLine = "";
    const container = document.querySelector("#stream-container",);
    if (container) { container.replaceChildren(); }
  },
};
