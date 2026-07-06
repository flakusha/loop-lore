import { jsonBody } from "./json";
import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "chat" });

export const chatManagement = {
  _renameChatId: "",
  _renameChatName: "",
  _chatSettingsName: "",
  _chatSettingsMode: "chat",
  _chatSettingsTurnStrategy: "round_robin",

  async deleteChat(chatId: string, event: Event) {
    const self = this as Record<string, unknown>;
    log.info("deleteChat", { chatId });
    if (!confirm("Delete this chat and all its messages?")) return;
    event.stopImmediatePropagation();
    const button = event.currentTarget as HTMLElement | null;
    try {
      const res = await apiFetch(`/api/chats/${chatId}`, { method: "DELETE" });
      if (res.ok) {
        const chats = self.chats as Array<Record<string, unknown>>;
        self.chats = chats.filter((c) => c.id !== chatId);
        if (self.activeChat === chatId) {
          self.activeChat = null;
          self.activeChatName = "Welcome to loop-lore";
          self.messages = [];
          globalThis.Alpine.store("ui").hasActiveChat = false;
          const titleEl = document.querySelector("#page-title");
          if (titleEl) titleEl.textContent = self.activeChatName as string;
        }
        self.$dispatch?.("show-toast", { type: "success", message: "Chat deleted" });
      } else {
        const err = await res.json();
        self.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to delete chat" });
      }
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Network error deleting chat" });
    }
    button?.blur();
  },

  openRenameModal(chatId: string) {
    const self = this as Record<string, unknown>;
    log.info("openRenameModal", { chatId });
    const chats = self.chats as Array<Record<string, unknown>>;
    const chat = chats.find((c) => c.id === chatId);
    self._renameChatId = chatId;
    self._renameChatName = (chat?.name as string) || "Chat";
    globalThis.Alpine.store("ui").showRenameModal = true;
  },

  async confirmRenameChat() {
    const self = this as Record<string, unknown>;
    log.info("confirmRenameChat", { chatId: self._renameChatId });
    const chats = self.chats as Array<Record<string, unknown>>;
    const name = (self._renameChatName as string).trim();
    if (!name || name === chats.find((c) => c.id === self._renameChatId)?.name) {
      globalThis.Alpine.store("ui").showRenameModal = false;
      return;
    }
    try {
      const res = await apiFetch(`/api/chats/${self._renameChatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ name }),
      });
      if (res.ok) {
        const chat = chats.find((c) => c.id === self._renameChatId);
        if (chat) chat.name = name;
        if (self.activeChat === self._renameChatId) {
          self.activeChatName = name;
          const titleEl = document.querySelector("#page-title");
          if (titleEl) titleEl.textContent = name;
        }
        globalThis.Alpine.store("ui").showRenameModal = false;
        self.$dispatch?.("show-toast", { type: "success", message: "Chat renamed" });
      } else {
        const err = await res.json();
        self.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to rename chat" });
      }
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Network error renaming chat" });
    }
  },

  renameChat(chatId: string) {
    this.openRenameModal(chatId);
  },

  openChatSettings() {
    const self = this as Record<string, unknown>;
    const chats = self.chats as Array<Record<string, unknown>>;
    const chat = chats.find((c) => c.id === self.activeChat);
    self._chatSettingsName = (chat?.name as string) || "";
    self._chatSettingsMode = "chat";
    self._chatSettingsTurnStrategy = "round_robin";
    globalThis.Alpine.store("ui").showChatSettings = true;
  },

  async saveChatSettings() {
    const self = this as Record<string, unknown>;
    log.info("saveChatSettings", { chatId: self.activeChat });
    if (!self.activeChat || !(self._chatSettingsName as string).trim()) return;
    try {
      const res = await apiFetch(`/api/chats/${self.activeChat}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({
          name: (self._chatSettingsName as string).trim(),
          mode: self._chatSettingsMode,
          turnStrategy: self._chatSettingsTurnStrategy,
        }),
      });
      if (res.ok) {
        const chats = self.chats as Array<Record<string, unknown>>;
        const chat = chats.find((c) => c.id === self.activeChat);
        if (chat) chat.name = (self._chatSettingsName as string).trim();
        self.activeChatName = (self._chatSettingsName as string).trim();
        const titleEl = document.querySelector("#page-title");
        if (titleEl) titleEl.textContent = self.activeChatName as string;
        globalThis.Alpine.store("ui").showChatSettings = false;
        self.$dispatch?.("show-toast", { type: "success", message: "Chat settings saved" });
      } else {
        const err = await res.json();
        self.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to save settings" });
      }
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Network error saving settings" });
    }
  },
};
