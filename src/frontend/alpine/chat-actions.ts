import { jsonBody } from "./json";
import { log as rootLog } from "./logger";
import type { ChatState } from "./types";

const log = rootLog.child({ module: "chat-actions" });

export const chatActions: Partial<ChatState> & ThisType<ChatState> = {
  async toggleImpersonate() {
    if (!this.activeChat || !this.currentCharacter) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No chat or character selected" });
      return;
    }

    try {
      if (this.impersonationActive) {
        const res = await apiFetch(`/api/chats/${this.activeChat}/impersonate`, { method: "DELETE" });
        if (res.ok) {
          this.impersonationActive = false;
          this.impersonatingActorId = null;
          this.$dispatch?.("show-toast", { type: "info", message: "Impersonation ended" });
        } else {
          const err = await res.json();
          this.$dispatch?.("show-toast", {
            type: "error",
            message: err.error || "Failed to end impersonation",
          });
        }
      } else {
        const res = await apiFetch(`/api/chats/${this.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({ impersonateActorId: this.currentCharacter.id }),
        });
        if (res.ok) {
          this.impersonationActive = true;
          this.impersonatingActorId = this.currentCharacter.id;
          this.$dispatch?.("show-toast", {
            type: "info",
            message: `Playing as ${this.currentCharacter.display_name || this.currentCharacter.name}`,
          });
        } else {
          const err = await res.json();
          this.$dispatch?.("show-toast", {
            type: "error",
            message: err.error || "Failed to start impersonation",
          });
        }
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error toggling impersonation" });
    }
  },

  async loadImpersonationState() {
    if (!this.activeChat) return;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/participants`);
      if (!res.ok) return;
      const data = await res.json();
      const participants = data.data || [];
      const me = participants.find(
        (p: { actor_id: string; display_name?: string }) =>
          p.actor_id === this.userRole || p.display_name === this.userDisplayName,
      );
      if (!me) {
        const selfParticipant = participants.find(
          (p: { impersonate_actor_id?: string | null }) => !!p.impersonate_actor_id,
        );
        if (selfParticipant) {
          this.impersonationActive = true;
          this.impersonatingActorId = selfParticipant.impersonate_actor_id!;
        }
        return;
      }
      if (me.impersonate_actor_id) {
        this.impersonationActive = true;
        this.impersonatingActorId = me.impersonate_actor_id as string;
      } else {
        this.impersonationActive = false;
        this.impersonatingActorId = null;
      }
    } catch {
      // Silent
    }
  },

  async generateImageFromMessage(msgId: string) {
    log.info("generateImageFromMessage", { messageId: msgId });
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No active chat" });
      return;
    }
    const msg = this.messages.find((m) => m.id === msgId);
    const prompt = msg?.content?.slice(0, 500) ?? "";
    if (!prompt) {
      this.$dispatch?.("show-toast", {
        type: "warning",
        message: "Message has no content for image generation",
      });
      return;
    }
    try {
      const res = await apiFetch("/api/generation/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ chatId: this.activeChat, messageId: msgId, prompt }),
      });
      if (res.ok) {
        this.$dispatch?.("show-toast", { type: "info", message: "Image generation started" });
      } else if (res.status === 501) {
        this.$dispatch?.("show-toast", {
          type: "info",
          message: "Image generation not configured yet — feature planned for 0.1.x",
        });
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", {
          type: "error",
          message: err.error || "Failed to generate image",
        });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error generating image" });
    }
  },

  async captionMessage(msgId: string) {
    log.info("captionMessage", { messageId: msgId });
    const msg = this.messages.find((m) => m.id === msgId);
    if (!msg) return;
    const imageAttachments = msg.attachments?.filter((a) => a.type === "image") ?? [];
    if (imageAttachments.length === 0) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No images in this message to caption" });
      return;
    }
    try {
      const res = await apiFetch("/api/generation/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({
          chatId: this.activeChat,
          messageId: msgId,
          assetIds: imageAttachments.map((a) => a.assetId),
        }),
      });
      if (res.ok) {
        this.$dispatch?.("show-toast", { type: "info", message: "Captioning started" });
      } else if (res.status === 501) {
        this.$dispatch?.("show-toast", {
          type: "info",
          message: "Captioning not configured yet — feature planned for 0.1.x",
        });
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to caption" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error captioning" });
    }
  },

  formattedGenerationTime(ms?: number): string {
    if (!ms) return "";
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
  },

  formattedTokensPerSecond(msg: {
    tokens_per_second?: number;
    generation_time_ms?: number;
    token_count_total?: number;
  }): string {
    if (msg.tokens_per_second != null) return `${msg.tokens_per_second.toFixed(1)} t/s`;
    if (msg.generation_time_ms && msg.token_count_total) {
      const tps = msg.token_count_total / (msg.generation_time_ms / 1000);
      return `${tps.toFixed(1)} t/s`;
    }
    return "";
  },

  statsLine(msg: {
    model_id?: string;
    provider?: string;
    generation_time_ms?: number;
    token_count_total?: number;
    tokens_per_second?: number;
  }): string {
    const parts: string[] = [];
    if (msg.model_id) parts.push(msg.model_id);
    if (msg.provider) parts.push(msg.provider);
    if (msg.generation_time_ms) parts.push(this.formattedGenerationTime(msg.generation_time_ms));
    if (msg.token_count_total != null) parts.push(`${msg.token_count_total}t`);
    const tps = this.formattedTokensPerSecond(msg);
    if (tps) parts.push(tps);
    return parts.join(" \u{B7} ");
  },
};
