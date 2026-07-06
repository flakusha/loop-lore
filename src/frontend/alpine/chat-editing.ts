import { jsonBody } from "./json";
import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "chat" });

export const chatEditing = {
  editingMessageId: null as string | null,
  editContent: "",
  previewMediaAsset: null as any,
  pendingAssets: [] as Array<{ assetId: string; filename: string }>,

  startEdit(msgId: string) {
    const self = this as Record<string, unknown>;
    const msgs = self.messages as Array<Record<string, unknown>>;
    const msg = msgs.find((m) => m.id === msgId);
    if (!msg) return;
    self.editingMessageId = msgId;
    self.editContent = msg.content;
  },

  cancelEdit() {
    const self = this as Record<string, unknown>;
    self.editingMessageId = null;
    self.editContent = "";
  },

  async saveEdit(msgId: string) {
    const self = this as Record<string, unknown>;
    log.info("saveEdit", { messageId: msgId });
    if (!self.activeChat || !(self.editContent as string).trim()) return;
    try {
      const res = await apiFetch(`/api/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ content: (self.editContent as string).trim() }),
      });
      if (res.ok) {
        const msgs = self.messages as Array<Record<string, unknown>>;
        const msg = msgs.find((m) => m.id === msgId);
        if (msg) msg.content = (self.editContent as string).trim();
        self.$dispatch?.("show-toast", { type: "success", message: "Message edited" });
      } else {
        const err = await res.json();
        self.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to save edit" });
      }
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Network error saving edit" });
    } finally {
      self.editingMessageId = null;
      self.editContent = "";
    }
  },

  async removeMessage(msgId: string, event: Event) {
    const self = this as Record<string, unknown>;
    log.info("removeMessage", { messageId: msgId });
    if (!self.activeChat) return;
    if (!confirm("Delete this message?")) return;
    event.stopImmediatePropagation();
    try {
      const res = await apiFetch(`/api/messages/${msgId}`, { method: "DELETE" });
      if (res.ok) {
        const msgs = self.messages as Array<Record<string, unknown>>;
        self.messages = msgs.filter((m) => m.id !== msgId);
        self.$dispatch?.("show-toast", { type: "success", message: "Message removed" });
      } else {
        const err = await res.json();
        self.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to remove" });
      }
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Network error removing message" });
    }
  },

  async copyMessage(msgId: string, event: Event) {
    const self = this as Record<string, unknown>;
    log.info("copyMessage", { messageId: msgId });
    const msgs = self.messages as Array<Record<string, unknown>>;
    const msg = msgs.find((m) => m.id === msgId);
    if (!msg) return;
    const button = event.currentTarget as HTMLElement | null;
    try {
      await navigator.clipboard.writeText(String(msg.content));
      self.$dispatch?.("show-toast", { type: "success", message: "Copied to clipboard" });
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Failed to copy" });
    }
    button?.blur();
  },

  async handleAttach(event: Event) {
    const self = this as Record<string, unknown>;
    log.info("handleAttach");
    if (!self.activeChat) {
      self.$dispatch?.("show-toast", { type: "warning", message: "Select a chat first" });
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
          self.pendingAssets = [
            ...(self.pendingAssets as Array<{ assetId: string; filename: string }>),
            { assetId: asset.id, filename: file.name },
          ];
          self.$dispatch?.("show-toast", { type: "success", message: `Ready to attach: ${file.name}` });
        } else {
          const err = await res.json();
          self.$dispatch?.("show-toast", {
            type: "error",
            message: err.error || `Failed to upload ${file.name}`,
          });
        }
      } catch {
        self.$dispatch?.("show-toast", { type: "error", message: `Network error uploading ${file.name}` });
      }
    }
    input.value = "";
  },

  removePendingAsset(assetId: string) {
    const self = this as Record<string, unknown>;
    const pending = self.pendingAssets as Array<{ assetId: string; filename: string }>;
    self.pendingAssets = pending.filter((a) => a.assetId !== assetId);
  },
};
