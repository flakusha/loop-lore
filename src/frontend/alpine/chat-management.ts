import { jsonBody } from "./json";
import { log as rootLog } from "./logger";
import type { ChatState } from "./types";

const log = rootLog.child({ module: "chat" });

export const chatManagement: Partial<ChatState> & ThisType<ChatState> = {
  _renameChatId: "",
  _renameChatName: "",
  _chatSettingsName: "",
  _chatSettingsMode: "chat",
  _chatSettingsTurnStrategy: "round_robin",

  async deleteChat(chatId: string, event: Event) {
    log.info("deleteChat", { chatId });
    if (!confirm("Delete this chat and all its messages?")) return;
    event.stopImmediatePropagation();
    const button = event.currentTarget as HTMLElement | null;
    try {
      const res = await apiFetch(`/api/chats/${chatId}`, { method: "DELETE" });
      if (res.ok) {
        const chats = this.chats;
        this.chats = chats.filter((c) => c.id !== chatId);
        if (this.activeChat === chatId) {
          this.activeChat = null;
          this.activeChatName = "Welcome to loop-lore";
          this.messages = [];
          Alpine.store("ui").hasActiveChat = false;
          const titleEl = document.querySelector("#page-title");
          if (titleEl) titleEl.textContent = this.activeChatName;
        }
        this.$dispatch?.("show-toast", { type: "success", message: "Chat deleted" });
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to delete chat" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error deleting chat" });
    }
    button?.blur();
  },

  openRenameModal(chatId: string) {
    log.info("openRenameModal", { chatId });
    const chats = this.chats;
    const chat = chats.find((c) => c.id === chatId);
    this._renameChatId = chatId;
    this._renameChatName = chat?.name ?? "Chat";
    Alpine.store("ui").showRenameModal = true;
  },

  async confirmRenameChat() {
    log.info("confirmRenameChat", { chatId: this._renameChatId });
    const chats = this.chats;
    const name = this._renameChatName.trim();
    if (!name || name === chats.find((c) => c.id === this._renameChatId)?.name) {
      Alpine.store("ui").showRenameModal = false;
      return;
    }
    try {
      const res = await apiFetch(`/api/chats/${this._renameChatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ name }),
      });
      if (res.ok) {
        const chat = chats.find((c) => c.id === this._renameChatId);
        if (chat) chat.name = name;
        if (this.activeChat === this._renameChatId) {
          this.activeChatName = name;
          const titleEl = document.querySelector("#page-title");
          if (titleEl) titleEl.textContent = name;
        }
        Alpine.store("ui").showRenameModal = false;
        this.$dispatch?.("show-toast", { type: "success", message: "Chat renamed" });
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to rename chat" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error renaming chat" });
    }
  },

  async renameChat(chatId: string) {
    this.openRenameModal(chatId);
  },

  async toggleChatPin(chatId: string) {
    const chats = this.chats;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;
    const pinned = !(chat.isPinned as number);
    try {
      const res = await apiFetch(`/api/chats/${chatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ isPinned: pinned }),
      });
      if (res.ok) {
        chat.isPinned = pinned ? 1 : 0;
        this.chats = [...chats];
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: "Failed to update pin state" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error updating pin state" });
    }
  },

  openChatSettings() {
    const chats = this.chats;
    const chat = chats.find((c) => c.id === this.activeChat);
    this._chatSettingsName = chat?.name ?? "";
    this._chatSettingsMode = "chat";
    this._chatSettingsTurnStrategy = "round_robin";
    Alpine.store("ui").showChatSettings = true;
  },

  async saveChatSettings() {
    log.info("saveChatSettings", { chatId: this.activeChat });
    if (!this.activeChat || !this._chatSettingsName.trim()) return;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({
          name: this._chatSettingsName.trim(),
          mode: this._chatSettingsMode,
          turnStrategy: this._chatSettingsTurnStrategy,
        }),
      });
      if (res.ok) {
        const chats = this.chats;
        const chat = chats.find((c) => c.id === this.activeChat);
        if (chat) chat.name = this._chatSettingsName.trim();
        this.activeChatName = this._chatSettingsName.trim();
        const titleEl = document.querySelector("#page-title");
        if (titleEl) titleEl.textContent = this.activeChatName;
        Alpine.store("ui").showChatSettings = false;
        this.$dispatch?.("show-toast", { type: "success", message: "Chat settings saved" });
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to save settings" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error saving settings" });
    }
  },
};
