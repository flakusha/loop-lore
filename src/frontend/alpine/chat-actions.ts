import { formattedGenerationTime, formattedTokensPerSecond, statsLine, } from "./chat-stats";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat-actions", },);

export const chatActions: Partial<ChatState> & ThisType<ChatState> = {
  _showCommandPalette: false,
  _activeCommand: "",
  _commandList: [
    { name: "help", description: "Show available commands", },
    { name: "roll", description: "Roll dice (e.g., /roll 2d6+3)", },
    { name: "summarize", description: "Summarize recent messages", },
    { name: "impersonate", description: "Play as a character", },
    { name: "narrate", description: "Inject narration text", },
    { name: "ooc", description: "Out-of-character message", },
    { name: "debug", description: "Toggle prompt debug view", },
    { name: "detail", description: "Set detail level (immersion/basic/detailed)", },
    { name: "improve", description: "Improve text with AI", },
    { name: "context", description: "Show conversation context", },
    { name: "clear", description: "Clear chat", },
    { name: "stats", description: "Show chat statistics", },
  ] as { name: string; description: string }[],
  _filteredCommands: [] as { name: string; description: string }[],

  handleCommandInput(event: Event,) {
    const input = event.target as HTMLTextAreaElement;
    const value = input.value;
    if (value.startsWith("/",) && !value.includes(" ",)) {
      const query = value.slice(1,).toLowerCase();
      this._showCommandPalette = true;
      this._filteredCommands = query
        ? this._commandList.filter((c,) => c.name.includes(query,))
        : this._commandList;
    } else {
      this._showCommandPalette = false;
    }
  },

  selectCommand(name: string,) {
    const input = this.$refs?.messageInput as HTMLTextAreaElement | undefined;
    if (input) {
      input.value = `/${name} `;
      input.focus();
    }
    this._showCommandPalette = false;
  },
  async toggleImpersonate() {
    if (!this.activeChat || !this.currentCharacter) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No chat or character selected", },);
      return;
    }

    try {
      if (this.impersonationActive) {
        const res = await apiFetch(`/api/chats/${this.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ impersonateActorId: null, },),
        },);
        if (res.ok) {
          this.impersonationActive = false;
          this.impersonatingActorId = null;
          this.$dispatch?.("show-toast", { type: "info", message: "Impersonation ended", },);
        } else {
          const err = await res.json();
          this.$dispatch?.("show-toast", {
            type: "error",
            message: err.error || "Failed to end impersonation",
          },);
        }
      } else {
        const res = await apiFetch(`/api/chats/${this.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ impersonateActorId: this.currentCharacter.id, },),
        },);
        if (res.ok) {
          this.impersonationActive = true;
          this.impersonatingActorId = this.currentCharacter.id;
          this.$dispatch?.("show-toast", {
            type: "info",
            message: `Playing as ${this.currentCharacter.display_name || this.currentCharacter.name}`,
          },);
        } else {
          const err = await res.json();
          this.$dispatch?.("show-toast", {
            type: "error",
            message: err.error || "Failed to start impersonation",
          },);
        }
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error toggling impersonation", },);
    }
  },

  async loadImpersonationState() {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/participants`,);
      if (!res.ok) { return; }
      const data = await res.json();
      const participants = data.data || [];
      const me = participants.find(
        (p: { actor_id: string; display_name?: string },) =>
          p.actor_id === this.userRole || p.display_name === this.userDisplayName,
      );
      if (!me) {
        const selfParticipant = participants.find(
          (p: { impersonate_actor_id?: string | null },) => !!p.impersonate_actor_id,
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

  async generateImageFromMessage(msgId: string,) {
    log.info("generateImageFromMessage", { messageId: msgId, },);
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No active chat", },);
      return;
    }
    const msg = this.messages.find((m,) => m.id === msgId);
    const prompt = msg?.content?.slice(0, 500,) ?? "";
    if (!prompt) {
      this.$dispatch?.("show-toast", {
        type: "warning",
        message: "Message has no content for image generation",
      },);
      return;
    }
    try {
      const res = await apiFetch("/api/generation/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ chatId: this.activeChat, messageId: msgId, prompt, },),
      },);
      if (res.ok) {
        this.$dispatch?.("show-toast", { type: "info", message: "Image generation started", },);
      } else if (res.status === 501) {
        this.$dispatch?.("show-toast", {
          type: "info",
          message: "Image generation not configured yet — feature planned for 0.1.x",
        },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", {
          type: "error",
          message: err.error || "Failed to generate image",
        },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error generating image", },);
    }
  },

  async captionMessage(msgId: string,) {
    log.info("captionMessage", { messageId: msgId, },);
    const msg = this.messages.find((m,) => m.id === msgId);
    if (!msg) { return; }
    const imageAttachments = msg.attachments?.filter((a,) => a.type === "image") ?? [];
    if (imageAttachments.length === 0) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No images in this message to caption", },);
      return;
    }
    try {
      const res = await apiFetch("/api/generation/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          chatId: this.activeChat,
          messageId: msgId,
          assetIds: imageAttachments.map((a,) => a.assetId),
        },),
      },);
      if (res.ok) {
        this.$dispatch?.("show-toast", { type: "info", message: "Captioning started", },);
      } else if (res.status === 501) {
        this.$dispatch?.("show-toast", {
          type: "info",
          message: "Captioning not configured yet — feature planned for 0.1.x",
        },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to caption", },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error captioning", },);
    }
  },

  formattedGenerationTime,
  formattedTokensPerSecond,
  statsLine,
};
