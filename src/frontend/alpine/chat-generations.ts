import { jsonBody, jsonParseOr } from "./json";
import { log as rootLog } from "./logger";
import { apiFetch } from "./htmx";

const log = rootLog.child({ module: "chat" });

export const chatGenerations = {
  connectGenerationSSE(chatId: string) {
    const s = this as any;
    if (s._generationEventSource) {
      s._generationEventSource.close();
    }
    s.isGenerating = true;
    const url = `/api/generation/stream/${chatId}`;
    const es = new EventSource(url);
    s._generationEventSource = es;

    es.addEventListener("stream-update", (event: MessageEvent) => {
      const container = document.querySelector("#stream-container");
      if (container) container.innerHTML = event.data;
      s.activeAttemptId = chatId;
    });

    es.addEventListener("stream-done", () => {
      log.info("generation complete via SSE", { chatId });
      s.isGenerating = false;
      s.activeAttemptId = null;
      s.generationDetail = null;
      s._cleanupSSE();
      void (async () => {
        try {
          await s.loadMessages();
        } catch {
          /* non-critical */
        }
      })();
    });

    es.addEventListener("stream-error", (event: MessageEvent) => {
      log.warn("generation error via SSE", { chatId, error: event.data });
      s.isGenerating = false;
      s.activeAttemptId = null;
      s.generationDetail = null;
      s._cleanupSSE();
      try {
        const data = jsonParseOr<{ error?: string }>(event.data, {});
        s.$dispatch?.("show-toast", { type: "error", message: data.error ?? "Generation failed" });
      } catch {
        s.$dispatch?.("show-toast", { type: "error", message: "Generation failed" });
      }
    });

    es.addEventListener("error", () => {
      if (es.readyState !== EventSource.CLOSED) return;
      log.debug("SSE connection closed permanently", { chatId });
      s.isGenerating = false;
      s._cleanupSSE();
    });
  },

  async checkGenerationStatus(chatId: string) {
    const s = this as any;
    log.debug("checkGenerationStatus", { chatId });
    try {
      const response = await apiFetch(`/api/generation/status/${chatId}`);
      const data = await response.json();
      const hadActiveAttempt = !!s.activeAttemptId;

      if (data.isActive) {
        s.isGenerating = true;
        s.activeAttemptId = data.attemptId;
        s.generationDetail = data.generation
          ? {
              attemptId: data.generation.attemptId,
              status: data.generation.status,
              elapsedMs: data.generation.elapsedMs,
              chunksReceived: data.generation.chunksReceived,
              charsReceived: data.generation.charsReceived,
            }
          : null;
        const detail = s.generationDetail;
        if (detail) {
          const elapsed = detail.elapsedMs ? ` (${Math.round(Number(detail.elapsedMs) / 1000)}s)` : "";
          const chars = detail.charsReceived ? ` · ${detail.charsReceived} chars` : "";
          s.generationLabel = `Generating${elapsed}${chars}`;
        }
      } else if (hadActiveAttempt) {
        log.info("generation complete", { chatId });
        s.isGenerating = false;
        s.activeAttemptId = null;
        s.generationDetail = null;
        await s.loadMessages();
      } else if (!s.isGenerating) {
        s.activeAttemptId = null;
        s.generationDetail = null;
      }
    } catch {
      /* Silent */
    }
  },

  async cancelGeneration() {
    const s = this as any;
    log.info("cancelGeneration", { chatId: s.activeChat });
    if (!s.activeChat) {
      s.$dispatch?.("show-toast", { type: "warning", message: "No active chat to cancel" });
      return;
    }
    try {
      const response = await apiFetch("/api/generation/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({
          chatId: s.activeChat,
          reason: "user_cancel",
          source: "user",
          detail: "User cancelled generation",
        }),
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        s.isGenerating = false;
        s.activeAttemptId = null;
        s.$dispatch?.("show-toast", { type: "info", message: "Generation cancelled" });
      } else {
        s.$dispatch?.("show-toast", { type: "error", message: data.error ?? "Failed to cancel generation" });
      }
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Network error cancelling generation" });
    }
  },

  _cleanupSSE() {
    const s = this as any;
    if (s._generationEventSource) {
      s._generationEventSource.close();
      s._generationEventSource = null;
    }
    const container = document.querySelector("#stream-container");
    if (container) container.replaceChildren();
  },
};
