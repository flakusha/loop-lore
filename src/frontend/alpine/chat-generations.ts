import { jsonBody } from "./json";
import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "chat" });

export const chatGenerations = {
  async checkGenerationStatus(chatId: string) {
    const self = this as Record<string, unknown>;
    log.debug("checkGenerationStatus", { chatId });
    try {
      const response = await apiFetch(`/api/generation/status/${chatId}`);
      const data = await response.json();
      const hadActiveAttempt = !!self.activeAttemptId;

      if (data.isActive) {
        self.isGenerating = true;
        self.activeAttemptId = data.attemptId;
        self.generationDetail = data.generation
          ? {
              attemptId: data.generation.attemptId,
              status: data.generation.status,
              elapsedMs: data.generation.elapsedMs,
              chunksReceived: data.generation.chunksReceived,
              charsReceived: data.generation.charsReceived,
            }
          : null;
        const detail = self.generationDetail as Record<string, unknown> | null;
        if (detail) {
          const elapsed = detail.elapsedMs ? ` (${Math.round(Number(detail.elapsedMs) / 1000)}s)` : "";
          const chars = detail.charsReceived ? ` · ${detail.charsReceived} chars` : "";
          self.generationLabel = `Generating${elapsed}${chars}`;
        }
      } else if (hadActiveAttempt) {
        log.info("generation complete", { chatId });
        self.isGenerating = false;
        self.activeAttemptId = null;
        self.generationDetail = null;
        await (this as any).loadMessages?.();
      } else if (!self.isGenerating) {
        self.activeAttemptId = null;
        self.generationDetail = null;
      }
    } catch {
      // Silent
    }
  },

  async cancelGeneration() {
    const self = this as Record<string, unknown>;
    log.info("cancelGeneration", { chatId: self.activeChat });
    if (!self.activeChat) {
      self.$dispatch?.("show-toast", { type: "warning", message: "No active chat to cancel" });
      return;
    }
    try {
      const response = await apiFetch("/api/generation/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({
          chatId: self.activeChat,
          reason: "user_cancel",
          source: "user",
          detail: "User cancelled generation",
        }),
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        self.isGenerating = false;
        self.activeAttemptId = null;
        self.$dispatch?.("show-toast", { type: "info", message: "Generation cancelled" });
      } else {
        self.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? "Failed to cancel generation",
        });
      }
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Network error cancelling generation" });
    }
  },

  async regenerateResponse() {
    const self = this as Record<string, unknown>;
    log.info("regenerateResponse", { chatId: self.activeChat });
    if (!self.activeChat) {
      self.$dispatch?.("show-toast", { type: "warning", message: "No active chat" });
      return;
    }
    try {
      const response = await apiFetch("/api/generation/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ chatId: self.activeChat }),
      });
      const data = await response.json();
      if (response.ok && data.ready) {
        self.$dispatch?.("show-toast", { type: "info", message: "Regenerating response..." });
      }
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Failed to regenerate" });
    }
  },

  async regenerateVariant(messageId: string) {
    const self = this as Record<string, unknown>;
    log.info("regenerateVariant", { messageId });
    if (!self.activeChat) return;
    self.isGenerating = true;
    try {
      const res = await apiFetch("/api/generation/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ chatId: self.activeChat, messageId }),
      });
      if (res.ok) {
        await (this as any).loadMessages?.();
        self.$dispatch?.("show-toast", { type: "info", message: "New variant generated" });
      }
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Failed to regenerate variant" });
    } finally {
      self.isGenerating = false;
    }
  },

  async switchVariant(messageId: string, direction: number) {
    const self = this as Record<string, unknown>;
    log.info("switchVariant", { messageId, direction });
    const msgs = self.messages as Array<Record<string, unknown>>;
    const msg = msgs.find((m) => m.id === messageId);
    if (!msg || !msg.totalVariants || (msg.totalVariants as number) <= 1) return;
    const newIdx = (((msg.variantIndex as number) ?? 0) + direction + (msg.totalVariants as number)) % (msg.totalVariants as number);
    try {
      const res = await apiFetch(`/api/messages/${messageId}/variant`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ variantIndex: newIdx }),
      });
      if (res.ok) {
        await (this as any).loadMessages?.();
      }
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Failed to switch variant" });
    }
  },

  async continueMessage(messageId: string) {
    const self = this as Record<string, unknown>;
    log.info("continueMessage", { messageId, chatId: self.activeChat });
    if (!self.activeChat) {
      self.$dispatch?.("show-toast", { type: "warning", message: "No active chat" });
      return;
    }
    const msgEl = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    const actorId = (msgEl as HTMLElement | null)?.dataset.actorId ?? "unknown";
    try {
      const response = await apiFetch("/api/generation/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ messageId, chatId: self.activeChat, actorId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        self.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? "Failed to continue message",
        });
        return;
      }
      self.continuingMessageId = messageId;
      self.isContinuing = true;
      self.isGenerating = true;
      if (msgEl) msgEl.classList.add("continued");
      self.$dispatch?.("show-toast", { type: "info", message: "Continuing message..." });
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Network error continuing message" });
    }
  },

  async retryFromPoint(attemptId: string, step: number) {
    const self = this as Record<string, unknown>;
    log.info("retryFromPoint", { attemptId, step, chatId: self.activeChat });
    if (!self.activeChat) {
      self.$dispatch?.("show-toast", { type: "warning", message: "No active chat" });
      return;
    }
    try {
      const response = await apiFetch("/api/generation/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ chatId: self.activeChat, attemptId, step }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        self.$dispatch?.("show-toast", {
          type: "error",
          message: data.error ?? "Failed to retry",
        });
        return;
      }
      self.$dispatch?.("show-toast", {
        type: "info",
        message:
          data.resumeFromStep > 0
            ? `Resuming from step ${data.resumeFromStep + 1} of ${data.totalSteps}...`
            : "Regenerating response...",
      });
      self.isGenerating = true;
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Network error during retry" });
    }
  },
};