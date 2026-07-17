import { jsonBody } from "./json";
import { log as rootLog } from "./logger";
import { apiFetch } from "./htmx";

const log = rootLog.child({ module: "chat-variants" });

export const chatVariants = {
  async regenerateResponse() {
    const s = this as any;
    log.info("regenerateResponse", { chatId: s.activeChat });
    if (!s.activeChat) {
      s.$dispatch?.("show-toast", { type: "warning", message: "No active chat" });
      return;
    }
    try {
      const response = await apiFetch("/api/generation/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ chatId: s.activeChat }),
      });
      const data = await response.json();
      if (response.ok && data.ready) {
        s.$dispatch?.("show-toast", { type: "info", message: "Regenerating response..." });
      }
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Failed to regenerate" });
    }
  },

  async regenerateVariant(messageId: string) {
    const s = this as any;
    log.info("regenerateVariant", { messageId });
    if (!s.activeChat) return;
    s.isGenerating = true;
    try {
      const res = await apiFetch("/api/generation/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ chatId: s.activeChat, messageId }),
      });
      if (res.ok) {
        await s.loadMessages();
        s.$dispatch?.("show-toast", { type: "info", message: "New variant generated" });
      }
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Failed to regenerate variant" });
    } finally {
      s.isGenerating = false;
    }
  },

  async switchVariant(messageId: string, direction: number) {
    const s = this as any;
    log.info("switchVariant", { messageId, direction });
    const msgs = s.messages;
    const msg = msgs.find((m: any) => m.id === messageId);
    if (!msg || !msg.totalVariants || msg.totalVariants <= 1) return;
    const newIdx = ((msg.variantIndex ?? 0) + direction + msg.totalVariants) % msg.totalVariants;
    try {
      const res = await apiFetch(`/api/messages/${messageId}/variant`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ variantIndex: newIdx }),
      });
      if (res.ok) await s.loadMessages();
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Failed to switch variant" });
    }
  },

  async continueMessage(messageId: string) {
    const s = this as any;
    log.info("continueMessage", { messageId, chatId: s.activeChat });
    if (!s.activeChat) {
      s.$dispatch?.("show-toast", { type: "warning", message: "No active chat" });
      return;
    }
    const msgEl = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
    const actorId = msgEl?.dataset.actorId ?? "unknown";
    try {
      const response = await apiFetch("/api/generation/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ messageId, chatId: s.activeChat, actorId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        s.$dispatch?.("show-toast", { type: "error", message: data.error ?? "Failed to continue message" });
        return;
      }
      s.continuingMessageId = messageId;
      s.isContinuing = true;
      s.isGenerating = true;
      if (msgEl) msgEl.classList.add("continued");
      s.$dispatch?.("show-toast", { type: "info", message: "Continuing message..." });
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Network error continuing message" });
    }
  },

  async retryFromPoint(attemptId: string, step: number) {
    const s = this as any;
    log.info("retryFromPoint", { attemptId, step, chatId: s.activeChat });
    if (!s.activeChat) {
      s.$dispatch?.("show-toast", { type: "warning", message: "No active chat" });
      return;
    }
    try {
      const response = await apiFetch("/api/generation/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ chatId: s.activeChat, attemptId, step }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        s.$dispatch?.("show-toast", { type: "error", message: data.error ?? "Failed to retry" });
        return;
      }
      s.$dispatch?.("show-toast", {
        type: "info",
        message:
          data.resumeFromStep > 0
            ? `Resuming from step ${data.resumeFromStep + 1} of ${data.totalSteps}...`
            : "Regenerating response...",
      });
      s.isGenerating = true;
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Network error during retry" });
    }
  },
};
