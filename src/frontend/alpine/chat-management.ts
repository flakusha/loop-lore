import type { ChatState, } from "./types";
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "chat", },);

export const chatManagement: Partial<ChatState> & ThisType<ChatState> = {
  _renameChatId: "",
  _renameChatName: "",
  selectedChats: [] as string[],

  async deleteChat(chatId: string, event: Event,) {
    log.info("deleteChat", { chatId, },);
    if (!confirm("Delete this chat and all its messages?",)) { return; }
    event.stopImmediatePropagation();
    const button = event.currentTarget as HTMLElement | null;
    try {
      const res = await apiFetch(`/api/chats/${chatId}`, { method: "DELETE", },);
      if (res.ok) {
        this.chats = this.chats.filter((c,) => c.id !== chatId);
        if (this.activeChat === chatId) {
          this.activeChat = null;
          this.activeChatName = "Welcome to loop-lore";
          this.messages = [];
          Alpine.store("ui",).hasActiveChat = false;
          const titleEl = document.querySelector("#page-title",);
          if (titleEl) { titleEl.textContent = this.activeChatName; }
        }
        this.$dispatch?.("show-toast", { type: "success", message: "Chat deleted", },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to delete chat", },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error deleting chat", },);
    }
    button?.blur();
  },

  openRenameModal(chatId: string,) {
    log.info("openRenameModal", { chatId, },);
    const chat = this.chats.find((c,) => c.id === chatId);
    this._renameChatId = chatId;
    this._renameChatName = chat?.name ?? "Chat";
    Alpine.store("ui",).showRenameModal = true;
  },

  async confirmRenameChat() {
    log.info("confirmRenameChat", { chatId: this._renameChatId, },);
    const name = this._renameChatName.trim();
    if (!name || name === this.chats.find((c,) => c.id === this._renameChatId)?.name) {
      Alpine.store("ui",).showRenameModal = false;
      return;
    }
    try {
      const res = await apiFetch(`/api/chats/${this._renameChatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ name, },),
      },);
      if (res.ok) {
        const chat = this.chats.find((c,) => c.id === this._renameChatId);
        if (chat) { chat.name = name; }
        if (this.activeChat === this._renameChatId) {
          this.activeChatName = name;
          const titleEl = document.querySelector("#page-title",);
          if (titleEl) { titleEl.textContent = name; }
        }
        Alpine.store("ui",).showRenameModal = false;
        this.$dispatch?.("show-toast", { type: "success", message: "Chat renamed", },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to rename chat", },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error renaming chat", },);
    }
  },

  async renameChat(chatId: string,) {
    this.openRenameModal(chatId,);
  },

  async toggleChatPin(chatId: string,) {
    const chat = this.chats.find((c,) => c.id === chatId);
    if (!chat) { return; }
    const pinned = !chat.isPinned;
    try {
      const res = await apiFetch(`/api/chats/${chatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ isPinned: pinned, },),
      },);
      if (res.ok) {
        chat.isPinned = pinned ? 1 : 0;
        this.chats = [...this.chats,];
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: "Failed to update pin state", },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error updating pin state", },);
    }
  },

  toggleChatSelection(chatId: string,) {
    const idx = this.selectedChats.indexOf(chatId,);
    if (idx === -1) {
      this.selectedChats.push(chatId,);
    } else {
      this.selectedChats.splice(idx, 1,);
    }
  },

  async batchArchive() {
    const ids = this.selectedChats;
    if (ids.length === 0) { return; }
    try {
      const res = await apiFetch("/api/chats/batch/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ ids, },),
      },);
      if (res.ok) {
        this.chats = this.chats.filter((c,) => !ids.includes(c.id,));
        this.selectedChats = [];
        this.$dispatch?.("show-toast", { type: "success", message: `Archived ${ids.length} chat(s)`, },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to archive", },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error archiving chats", },);
    }
  },

  async batchDelete() {
    const ids = this.selectedChats;
    if (ids.length === 0) { return; }
    if (!confirm(`Delete ${ids.length} chat(s) and all their messages?`,)) { return; }
    try {
      const res = await apiFetch("/api/chats/batch/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ ids, },),
      },);
      if (res.ok) {
        this.chats = this.chats.filter((c,) => !ids.includes(c.id,));
        this.selectedChats = [];
        if (this.activeChat && ids.includes(this.activeChat,)) {
          this.activeChat = null;
          this.activeChatName = "Welcome to loop-lore";
          this.messages = [];
          Alpine.store("ui",).hasActiveChat = false;
        }
        this.$dispatch?.("show-toast", { type: "success", message: `Deleted ${ids.length} chat(s)`, },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to delete", },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error deleting chats", },);
    }
  },

  async batchExport() {
    const ids = this.selectedChats;
    if (ids.length === 0) { return; }
    try {
      const res = await apiFetch("/api/chats/batch/export", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ ids, },),
      },);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob,);
        const a = document.createElement("a",);
        a.href = url;
        a.download = "chats-export.json";
        a.click();
        URL.revokeObjectURL(url,);
        this.$dispatch?.("show-toast", { type: "success", message: `Exported ${ids.length} chat(s)`, },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to export", },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error exporting chats", },);
    }
  },
};
