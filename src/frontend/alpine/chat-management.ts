import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

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
          this.activeChatName = t("chats.welcomeTitle",);
          this.messages = [];
          Alpine.store("ui",).hasActiveChat = false;
          const titleEl = document.querySelector("#page-title",);
          if (titleEl) { titleEl.textContent = this.activeChatName; }
        }
        this.$dispatch?.("show-toast", { type: "success", message: t("toasts.chatDeleted",), },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedDeleteChat",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorDeletingChat",), },);
    }
    button?.blur();
  },

  openRenameModal(chatId: string,) {
    log.info("openRenameModal", { chatId, },);
    const chat = this.chats.find((c,) => c.id === chatId);
    this._renameChatId = chatId;
    this._renameChatName = chat?.name ?? t("chats.untitledChat",);
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
        this.$dispatch?.("show-toast", { type: "success", message: t("toasts.chatRenamed",), },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedRenameChat",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorRenamingChat",), },);
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
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedUpdatePinState",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorUpdatingPinState",), },);
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
        this.$dispatch?.("show-toast", {
          type: "success",
          message: t("toasts.archivedCount", { count: String(ids.length,), },),
        },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedArchive",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorArchivingChats",), },);
    }
  },

  async batchDelete() {
    const ids = this.selectedChats;
    if (ids.length === 0) { return; }
    if (!confirm(t("modals.deleteChatsCount", { count: String(ids.length,), },),)) { return; }
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
          this.activeChatName = t("chats.welcomeTitle",);
          this.messages = [];
          Alpine.store("ui",).hasActiveChat = false;
        }
        this.$dispatch?.("show-toast", {
          type: "success",
          message: t("toasts.deletedCount", { count: String(ids.length,), },),
        },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedDelete",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorDeletingChats",), },);
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
        this.$dispatch?.("show-toast", {
          type: "success",
          message: t("toasts.exportedCount", { count: String(ids.length,), },),
        },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedExport",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorExportingChats",), },);
    }
  },
};
