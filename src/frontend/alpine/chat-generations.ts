import { apiFetch, } from "./htmx";
import { jsonBody, jsonParseOr, } from "./json";
import { log as rootLog, } from "./logger";
import { trackTelemetry, } from "./telemetry";
import type { ChatState, } from "./types";

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

    es.addEventListener("stream-update", (event: MessageEvent,) => {
      const container = document.querySelector("#stream-container",);
      if (container) {
        const DOMPurify = getDOMPurify();
        container.innerHTML = DOMPurify ? DOMPurify.sanitize(event.data,) : event.data;
      }
      this.activeAttemptId = chatId;
    },);

    es.addEventListener("stream-done", () => {
      trackTelemetry("generation.completed", { chatId, },);
      this.isGenerating = false;
      this.activeAttemptId = null;
      this.generationDetail = null;
      this._cleanupSSE();
      void (async () => {
        try {
          await this.loadMessages();
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
      this._cleanupSSE();
      try {
        const data = jsonParseOr<{ error?: string }>(event.data, {},);
        this.$dispatch?.("show-toast", { type: "error", message: data.error ?? "Generation failed", },);
      } catch {
        this.$dispatch?.("show-toast", { type: "error", message: "Generation failed", },);
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
    } catch {
      /* Silent */
    }
  },

  async cancelGeneration() {
    log.info("cancelGeneration", { chatId: this.activeChat, },);
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No active chat to cancel", },);
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
        this.$dispatch?.("show-toast", { type: "info", message: "Generation cancelled", },);
      } else {
        this.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? "Failed to cancel generation",
        },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error cancelling generation", },);
    }
  },

  _cleanupSSE() {
    if (this._generationEventSource) {
      this._generationEventSource.close();
      this._generationEventSource = null;
    }
    const container = document.querySelector("#stream-container",);
    if (container) { container.replaceChildren(); }
  },
};
