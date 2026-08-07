import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, GalleryAsset, } from "./types";

const log = rootLog.child({ module: "chat", },);

export const chatEditing: Partial<ChatState> & ThisType<ChatState> = {
  editingMessageId: null as string | null,
  editContent: "",
  previewMediaAsset: null as GalleryAsset | null,
  pendingAssets: [] as { assetId: string; filename: string }[],

  startEdit(msgId: string,) {
    const msgs = this.messages;
    const msg = msgs.find((m,) => m.id === msgId);
    if (!msg) { return; }
    this.editingMessageId = msgId;
    this.editContent = msg.content;
  },

  cancelEdit() {
    this.editingMessageId = null;
    this.editContent = "";
  },

  async saveEdit(msgId: string,) {
    log.info("saveEdit", { messageId: msgId, },);
    if (!this.activeChat || !this.editContent.trim()) { return; }
    try {
      const res = await apiFetch(`/api/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ content: this.editContent.trim(), },),
      },);
      if (res.ok) {
        const msgs = this.messages;
        const msg = msgs.find((m,) => m.id === msgId);
        if (msg) { msg.content = this.editContent.trim(); }
        this.$dispatch?.("show-toast", { type: "success", message: t("toasts.messageEdited",), },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedSaveEdit",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorSavingEdit",), },);
    } finally {
      this.editingMessageId = null;
      this.editContent = "";
    }
  },

  async removeMessage(msgId: string, event: Event,) {
    log.info("removeMessage", { messageId: msgId, },);
    if (!this.activeChat) { return; }
    if (!confirm(t("modals.deleteMessage",),)) { return; }
    event.stopImmediatePropagation();
    try {
      const res = await apiFetch(`/api/messages/${msgId}`, { method: "DELETE", },);
      if (res.ok) {
        const msgs = this.messages;
        const filtered: typeof msgs = [];
        for (const m of msgs) { if (m.id !== msgId) { filtered.push(m,); } }
        this.messages = filtered;
        this.$dispatch?.("show-toast", { type: "success", message: t("toasts.messageRemoved",), },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedRemove",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorRemovingMessage",), },);
    }
  },

  async copyMessage(msgId: string, event: Event,) {
    log.info("copyMessage", { messageId: msgId, },);
    const msgs = this.messages;
    const msg = msgs.find((m,) => m.id === msgId);
    if (!msg) { return; }
    const button = event.currentTarget as HTMLElement | null;
    try {
      await navigator.clipboard.writeText(msg.content,);
      this.$dispatch?.("show-toast", { type: "success", message: t("toasts.copiedToClipboard",), },);
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedCopy",), },);
    }
    button?.blur();
  },

  async handleAttach(event: Event,) {
    log.info("handleAttach",);
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.selectChatFirst",), },);
      return;
    }
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) { return; }

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file,);
      formData.append("alt_text", file.name,);

      try {
        const res = await apiFetch("/api/assets", { method: "POST", body: formData, },);
        if (res.ok) {
          const asset = await res.json();
          this.pendingAssets = [...this.pendingAssets, { assetId: asset.id, filename: file.name, },];
          this.$dispatch?.("show-toast", {
            type: "success",
            message: t("toasts.readyToAttach", { filename: file.name, },),
          },);
        } else {
          const err = await res.json();
          this.$dispatch?.("show-toast", {
            type: "error",
            message: err.error || t("toasts.failedUpload", { filename: file.name, },),
          },);
        }
      } catch {
        this.$dispatch?.("show-toast", {
          type: "error",
          message: t("toasts.networkErrorUploading", { filename: file.name, },),
        },);
      }
    }
    input.value = "";
  },

  removePendingAsset(assetId: string,) {
    const pending = this.pendingAssets;
    const filtered: typeof pending = [];
    for (const a of pending) { if (a.assetId !== assetId) { filtered.push(a,); } }
    this.pendingAssets = filtered;
  },
};
