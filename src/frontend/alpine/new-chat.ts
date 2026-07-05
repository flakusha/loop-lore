// ── New Chat page component (new-chat.html) ────────────────

globalThis.newChatState = function () {
  return {
    name: "",
    chatType: "user_character",
    chatMode: "roleplay",
    error: "",
    submitting: false,

    init() {
      (this as any).$root.pageTitle = "New Chat";
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
          body: JSON.stringify({
            name: this.name.trim(),
            type: this.chatType,
            mode: this.chatMode,
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
