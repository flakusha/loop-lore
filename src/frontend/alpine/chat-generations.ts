import { jsonBody, jsonParseOr } from "./json";
import { log as rootLog } from "./logger";
import type { ChatState } from "./types";

const log = rootLog.child({ module: "chat" });

export const chatGenerations: Partial<ChatState> & ThisType<ChatState> = {
  connectGenerationSSE(chatId: string) {
    // Close any existing connection
    if (this._generationEventSource) {
      this._generationEventSource.close();
    }

    this.isGenerating = true;
    const url = `/api/generation/stream/${chatId}`;
    const es = new EventSource(url);
    this._generationEventSource = es;

    es.addEventListener("stream-update", (event: MessageEvent) => {
      // Event data is HTMX HTML partial — swap into stream container
      const container = document.querySelector("#stream-container");
      if (container) {
        container.innerHTML = event.data;
      }
      // Also update Alpine state for generation label
      this.activeAttemptId = chatId;
    });

    es.addEventListener("stream-done", () => {
      log.info("generation complete via SSE", { chatId });
      this.isGenerating = false;
      this.activeAttemptId = null;
      this.generationDetail = null;
      this._cleanupSSE();
      // Reload full message list (persisted message now available)
      void (async () => { try { await this.loadMessages(); } catch { /* non-critical */ } })();
    });

    es.addEventListener("stream-error", (event: MessageEvent) => {
      log.warn("generation error via SSE", { chatId, error: event.data });
      this.isGenerating = false;
      this.activeAttemptId = null;
      this.generationDetail = null;
      this._cleanupSSE();
      try {
        const data = jsonParseOr<{ error?: string }>(event.data, {});
        this.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? "Generation failed",
        });
      } catch {
        this.$dispatch?.("show-toast", { type: "error", message: "Generation failed" });
      }
    });

    es.addEventListener("error", () => {
      if (es.readyState !== EventSource.CLOSED) return;
      log.debug("SSE connection closed permanently", { chatId });
      this.isGenerating = false;
      this._cleanupSSE();
    });
  },

  async checkGenerationStatus(chatId: string) {
    log.debug("checkGenerationStatus", { chatId });
    try {
      const response = await apiFetch(`/api/generation/status/${chatId}`);
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
          const elapsed = detail.elapsedMs ? ` (${Math.round(Number(detail.elapsedMs) / 1000)}s)` : "";
          const chars = detail.charsReceived ? ` · ${detail.charsReceived} chars` : "";
          this.generationLabel = `Generating${elapsed}${chars}`;
        }
      } else if (hadActiveAttempt) {
        log.info("generation complete", { chatId });
        this.isGenerating = false;
        this.activeAttemptId = null;
        this.generationDetail = null;
        await this.loadMessages();
      } else if (!this.isGenerating) {
        this.activeAttemptId = null;
        this.generationDetail = null;
      }
    } catch {
      // Silent
    }
  },

  async cancelGeneration() {
    log.info("cancelGeneration", { chatId: this.activeChat });
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No active chat to cancel" });
      return;
    }
    try {
      const response = await apiFetch("/api/generation/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({
          chatId: this.activeChat,
          reason: "user_cancel",
          source: "user",
          detail: "User cancelled generation",
        }),
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        this.isGenerating = false;
        this.activeAttemptId = null;
        this.$dispatch?.("show-toast", { type: "info", message: "Generation cancelled" });
      } else {
        this.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? "Failed to cancel generation",
        });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error cancelling generation" });
    }
  },

  async regenerateResponse() {
    log.info("regenerateResponse", { chatId: this.activeChat });
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No active chat" });
      return;
    }
    try {
      const response = await apiFetch("/api/generation/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ chatId: this.activeChat }),
      });
      const data = await response.json();
      if (response.ok && data.ready) {
        this.$dispatch?.("show-toast", { type: "info", message: "Regenerating response..." });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Failed to regenerate" });
    }
  },

  async regenerateVariant(messageId: string) {
    log.info("regenerateVariant", { messageId });
    if (!this.activeChat) return;
    this.isGenerating = true;
    try {
      const res = await apiFetch("/api/generation/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ chatId: this.activeChat, messageId }),
      });
      if (res.ok) {
        await this.loadMessages();
        this.$dispatch?.("show-toast", { type: "info", message: "New variant generated" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Failed to regenerate variant" });
    } finally {
      this.isGenerating = false;
    }
  },

  async switchVariant(messageId: string, direction: number) {
    log.info("switchVariant", { messageId, direction });
    const msgs = this.messages;
    const msg = msgs.find((m) => m.id === messageId);
    if (!msg || !msg.totalVariants || msg.totalVariants! <= 1) return;
    const newIdx = ((msg.variantIndex ?? 0) + direction + msg.totalVariants!) % msg.totalVariants!;
    try {
      const res = await apiFetch(`/api/messages/${messageId}/variant`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ variantIndex: newIdx }),
      });
      if (res.ok) {
        await this.loadMessages();
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Failed to switch variant" });
    }
  },

  async continueMessage(messageId: string) {
    log.info("continueMessage", { messageId, chatId: this.activeChat });
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No active chat" });
      return;
    }
    const msgEl = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
    const actorId = msgEl?.dataset.actorId ?? "unknown";
    try {
      const response = await apiFetch("/api/generation/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ messageId, chatId: this.activeChat, actorId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        this.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? "Failed to continue message",
        });
        return;
      }
      this.continuingMessageId = messageId;
      this.isContinuing = true;
      this.isGenerating = true;
      if (msgEl) msgEl.classList.add("continued");
      this.$dispatch?.("show-toast", { type: "info", message: "Continuing message..." });
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error continuing message" });
    }
  },

  _cleanupSSE() {
    if (this._generationEventSource) {
      this._generationEventSource.close();
      this._generationEventSource = null;
    }
    // Clear stream container
    const container = document.querySelector("#stream-container");
    if (container) {
      container.replaceChildren();
    }
  },

  async retryFromPoint(attemptId: string, step: number) {
    log.info("retryFromPoint", { attemptId, step, chatId: this.activeChat });
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No active chat" });
      return;
    }
    try {
      const response = await apiFetch("/api/generation/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ chatId: this.activeChat, attemptId, step }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        this.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? "Failed to retry",
        });
        return;
      }
      this.$dispatch?.("show-toast", {
        type: "info",
        message:
          data.resumeFromStep > 0
            ? `Resuming from step ${data.resumeFromStep + 1} of ${data.totalSteps}...`
            : "Regenerating response...",
      });
      this.isGenerating = true;
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error during retry" });
    }
  },
};
