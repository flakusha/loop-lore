// ── New Chat page component (new-chat.html) ────────────────

import { jsonBody } from "./json";

globalThis.newChatState = function () {
  return {
    name: "",
    chatType: "user_character",
    chatMode: "roleplay",
    error: "",
    submitting: false,

    init() {
      // title is static — OOB header handles it
    },

    typeEnum(type: string): string {
      return { user_character: "direct", user_user: "direct", user_assistant: "direct" }[type] ?? "direct";
    },
    modeEnum(mode: string): string {
      return { roleplay: "story", chat: "direct", story: "story" }[mode] ?? "story";
    },

    async createChat() {
      if (!this.name.trim()) {
        this.error = "Chat name is required.";
        return;
      }
      this.submitting = true;
      this.error = "";
      try {
        const res = await apiFetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({
            name: this.name.trim(),
            type: this.typeEnum(this.chatType),
            mode: this.modeEnum(this.chatMode),
          }),
        });
        if (res.ok) {
          location.assign("/views/chat");
        } else {
          const data = await res.json();
          this.error = data.error || "Failed to create chat.";
        }
      } catch {
        this.error = "Network error.";
      } finally {
        this.submitting = false;
      }
    },
  };
};
