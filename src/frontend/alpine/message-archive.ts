// ── Message archive / restore ─
import { apiFetch, } from "./htmx";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "message-archive", },);

export const messageArchive: Partial<ChatState> & ThisType<ChatState> = {
  _archiveConfirmOpen: false,
  _archiveConfirmId: null,

  async archiveMessage(messageId: string,) {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/messages/${messageId}/archive`, {
        method: "POST",
      },);
      if (res.ok) {
        const filtered = [];
        for (const m of this.messages) {
          if (m.id !== messageId) { filtered.push(m,); }
        }
        this.messages = filtered;
        this.$dispatch?.("show-toast", { type: "success", message: "Message archived", },);
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: "Failed to archive message", },);
      }
    } catch (error) {
      log.warn("archiveMessage failed", { error: String(error,), },);
      this.$dispatch?.("show-toast", { type: "error", message: "Failed to archive message", },);
    }
    this._archiveConfirmOpen = false;
    this._archiveConfirmId = null;
  },

  async restoreMessage(messageId: string,) {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/messages/${messageId}/restore`, {
        method: "POST",
      },);
      if (res.ok) {
        this.$dispatch?.("show-toast", { type: "success", message: "Message restored", },);
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: "Failed to restore message", },);
      }
    } catch (error) {
      log.warn("restoreMessage failed", { error: String(error,), },);
      this.$dispatch?.("show-toast", { type: "error", message: "Failed to restore message", },);
    }
  },

  async confirmArchive() {
    if (this._archiveConfirmId) {
      await this.archiveMessage(this._archiveConfirmId,);
    }
  },

  cancelArchive() {
    this._archiveConfirmOpen = false;
    this._archiveConfirmId = null;
  },
};
