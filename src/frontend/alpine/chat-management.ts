import { jsonBody } from "./json";
import { log as rootLog } from "./logger";
import { apiFetch } from "./htmx";

const log = rootLog.child({ module: "chat" });

export const chatManagement = {
  _renameChatId: "",
  _renameChatName: "",
  selectedChats: [] as string[],

  async deleteChat(chatId: string, event: Event) {
    const s = this as any;
    log.info("deleteChat", { chatId });
    if (!confirm("Delete this chat and all its messages?")) return;
    event.stopImmediatePropagation();
    const button = event.currentTarget as HTMLElement | null;
    try {
      const res = await apiFetch(`/api/chats/${chatId}`, { method: "DELETE" });
      if (res.ok) {
        s.chats = s.chats.filter((c: any) => c.id !== chatId);
        if (s.activeChat === chatId) {
          s.activeChat = null;
          s.activeChatName = "Welcome to loop-lore";
          s.messages = [];
          Alpine.store("ui").hasActiveChat = false;
          const titleEl = document.querySelector("#page-title");
          if (titleEl) titleEl.textContent = s.activeChatName;
        }
        s.$dispatch?.("show-toast", { type: "success", message: "Chat deleted" });
      } else {
        const err = await res.json();
        s.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to delete chat" });
      }
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Network error deleting chat" });
    }
    button?.blur();
  },

  openRenameModal(chatId: string) {
    const s = this as any;
    log.info("openRenameModal", { chatId });
    const chat = s.chats.find((c: any) => c.id === chatId);
    s._renameChatId = chatId;
    s._renameChatName = chat?.name ?? "Chat";
    Alpine.store("ui").showRenameModal = true;
  },

  async confirmRenameChat() {
    const s = this as any;
    log.info("confirmRenameChat", { chatId: s._renameChatId });
    const name = s._renameChatName.trim();
    if (!name || name === s.chats.find((c: any) => c.id === s._renameChatId)?.name) {
      Alpine.store("ui").showRenameModal = false;
      return;
    }
    try {
      const res = await apiFetch(`/api/chats/${s._renameChatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ name }),
      });
      if (res.ok) {
        const chat = s.chats.find((c: any) => c.id === s._renameChatId);
        if (chat) chat.name = name;
        if (s.activeChat === s._renameChatId) {
          s.activeChatName = name;
          const titleEl = document.querySelector("#page-title");
          if (titleEl) titleEl.textContent = name;
        }
        Alpine.store("ui").showRenameModal = false;
        s.$dispatch?.("show-toast", { type: "success", message: "Chat renamed" });
      } else {
        const err = await res.json();
        s.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to rename chat" });
      }
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Network error renaming chat" });
    }
  },

  async renameChat(chatId: string) {
    (this as any).openRenameModal(chatId);
  },

  async toggleChatPin(chatId: string) {
    const s = this as any;
    const chat = s.chats.find((c: any) => c.id === chatId);
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
        s.chats = [...s.chats];
      } else {
        s.$dispatch?.("show-toast", { type: "error", message: "Failed to update pin state" });
      }
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Network error updating pin state" });
    }
  },

  toggleChatSelection(chatId: string) {
    const idx = this.selectedChats.indexOf(chatId);
    if (idx === -1) {
      this.selectedChats.push(chatId);
    } else {
      this.selectedChats.splice(idx, 1);
    }
  },

  async batchArchive() {
    const s = this as any;
    const ids = s.selectedChats;
    if (ids.length === 0) return;
    try {
      const res = await apiFetch("/api/chats/batch/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ ids }),
      });
      if (res.ok) {
        s.chats = s.chats.filter((c: any) => !ids.includes(c.id));
        s.selectedChats = [];
        s.$dispatch?.("show-toast", { type: "success", message: `Archived ${ids.length} chat(s)` });
      } else {
        const err = await res.json();
        s.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to archive" });
      }
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Network error archiving chats" });
    }
  },

  async batchDelete() {
    const s = this as any;
    const ids = s.selectedChats;
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} chat(s) and all their messages?`)) return;
    try {
      const res = await apiFetch("/api/chats/batch/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ ids }),
      });
      if (res.ok) {
        s.chats = s.chats.filter((c: any) => !ids.includes(c.id));
        s.selectedChats = [];
        if (s.activeChat && ids.includes(s.activeChat)) {
          s.activeChat = null;
          s.activeChatName = "Welcome to loop-lore";
          s.messages = [];
          Alpine.store("ui").hasActiveChat = false;
        }
        s.$dispatch?.("show-toast", { type: "success", message: `Deleted ${ids.length} chat(s)` });
      } else {
        const err = await res.json();
        s.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to delete" });
      }
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Network error deleting chats" });
    }
  },

  async batchExport() {
    const s = this as any;
    const ids = s.selectedChats;
    if (ids.length === 0) return;
    try {
      const res = await apiFetch("/api/chats/batch/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ ids }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "chats-export.json";
        a.click();
        URL.revokeObjectURL(url);
        s.$dispatch?.("show-toast", { type: "success", message: `Exported ${ids.length} chat(s)` });
      } else {
        const err = await res.json();
        s.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to export" });
      }
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Network error exporting chats" });
    }
  },
};
