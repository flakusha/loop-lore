import { jsonBody } from "./json";
import { log as rootLog } from "./logger";
import type { ChatState, GalleryAsset } from "./types";

const log = rootLog.child({ module: "chat" });

export const chatEditing: Partial<ChatState> & ThisType<ChatState> = {
  editingMessageId: null as string | null,
  editContent: "",
  previewMediaAsset: null as GalleryAsset | null,
  pendingAssets: [] as { assetId: string; filename: string }[],

  startEdit(msgId: string) {
    const msgs = this.messages;
    const msg = msgs.find((m) => m.id === msgId);
    if (!msg) return;
    this.editingMessageId = msgId;
    this.editContent = msg.content;
  },

  cancelEdit() {
    this.editingMessageId = null;
    this.editContent = "";
  },

  async saveEdit(msgId: string) {
    log.info("saveEdit", { messageId: msgId });
    if (!this.activeChat || !this.editContent.trim()) return;
    try {
      const res = await apiFetch(`/api/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ content: this.editContent.trim() }),
      });
      if (res.ok) {
        const msgs = this.messages;
        const msg = msgs.find((m) => m.id === msgId);
        if (msg) msg.content = this.editContent.trim();
        this.$dispatch?.("show-toast", { type: "success", message: "Message edited" });
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to save edit" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error saving edit" });
    } finally {
      this.editingMessageId = null;
      this.editContent = "";
    }
  },

  async removeMessage(msgId: string, event: Event) {
    log.info("removeMessage", { messageId: msgId });
    if (!this.activeChat) return;
    if (!confirm("Delete this message?")) return;
    event.stopImmediatePropagation();
    try {
      const res = await apiFetch(`/api/messages/${msgId}`, { method: "DELETE" });
      if (res.ok) {
        const msgs = this.messages;
        this.messages = msgs.filter((m) => m.id !== msgId);
        this.$dispatch?.("show-toast", { type: "success", message: "Message removed" });
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to remove" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error removing message" });
    }
  },

  async copyMessage(msgId: string, event: Event) {
    log.info("copyMessage", { messageId: msgId });
    const msgs = this.messages;
    const msg = msgs.find((m) => m.id === msgId);
    if (!msg) return;
    const button = event.currentTarget as HTMLElement | null;
    try {
      await navigator.clipboard.writeText(msg.content);
      this.$dispatch?.("show-toast", { type: "success", message: "Copied to clipboard" });
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Failed to copy" });
    }
    button?.blur();
  },

  async handleAttach(event: Event) {
    log.info("handleAttach");
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: "Select a chat first" });
      return;
    }
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt_text", file.name);

      try {
        const res = await apiFetch("/api/assets", { method: "POST", body: formData });
        if (res.ok) {
          const asset = await res.json();
          this.pendingAssets = [...this.pendingAssets, { assetId: asset.id, filename: file.name }];
          this.$dispatch?.("show-toast", { type: "success", message: `Ready to attach: ${file.name}` });
        } else {
          const err = await res.json();
          this.$dispatch?.("show-toast", {
            type: "error",
            message: err.error || `Failed to upload ${file.name}`,
          });
        }
      } catch {
        this.$dispatch?.("show-toast", { type: "error", message: `Network error uploading ${file.name}` });
      }
    }
    input.value = "";
  },

  removePendingAsset(assetId: string) {
    const pending = this.pendingAssets;
    this.pendingAssets = pending.filter((a) => a.assetId !== assetId);
  },
};
