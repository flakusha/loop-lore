// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

  /**
   * @param {string} msgId
   * @returns {void}
   */
  startEdit(msgId: string,) {
    const msgs = this.messages;
    const msg = msgs.find((m,) => m.id === msgId);
    if (!msg) { return; }
    this.editingMessageId = msgId;
    this.editContent = msg.content;
  },

  /**
   * @returns {void}
   */
  cancelEdit() {
    this.editingMessageId = null;
    this.editContent = "";
  },

  /**
   * @param {string} msgId
   * @returns {Promise<void>}
   */
  async saveEdit(msgId: string,) {
    log.info("saveEdit", { messageId: msgId, },);
    if (!this.activeChat || !this.editContent.trim()) { return; }
    try {
      await apiFetch(`/api/v1/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ content: this.editContent.trim(), },),
      },);

      const msgs = this.messages;
      const msg = msgs.find((m,) => m.id === msgId);
      if (msg) { msg.content = this.editContent.trim(); }
      this.$dispatch?.("show-toast", { type: "success", message: t("toasts.messageEdited",), },);
    } catch (error) {
      // A non-2xx PATCH rejects with the status attached (not a network fault);
      // msg.content is only assigned on the success path, so a failed save
      // leaves the stored message matching what the server still holds.
      // feFetch assigns .status on every failure path, but it is undefined
      // when the request never reached the server — branch on the value.
      const status = error instanceof Error && "status" in error ? error.status : undefined;
      this.$dispatch?.("show-toast", {
        type: "error",
        message: status ? t("toasts.failedSaveEdit",) : t("toasts.networkErrorSavingEdit",),
      },);
    } finally {
      this.editingMessageId = null;
      this.editContent = "";
    }
  },

  /**
   * @param {string} msgId
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async removeMessage(msgId: string, event: Event,) {
    log.info("removeMessage", { messageId: msgId, },);
    if (!this.activeChat) { return; }
    if (!confirm(t("modals.deleteMessage",),)) { return; }
    event.stopImmediatePropagation();
    try {
      await apiFetch(`/api/v1/messages/${msgId}`, { method: "DELETE", },);
      const msgs = this.messages;
      const filtered: typeof msgs = [];
      for (const m of msgs) { if (m.id !== msgId) { filtered.push(m,); } }
      this.messages = filtered;
      this.$dispatch?.("show-toast", { type: "success", message: t("toasts.messageRemoved",), },);
    } catch (error) {
      // A non-2xx delete rejects with the status attached (not a network
      // fault); the message list is left untouched so the row stays visible.
      const status = error instanceof Error && "status" in error ? error.status : undefined;
      this.$dispatch?.("show-toast", {
        type: "error",
        message: status ? t("toasts.failedRemove",) : t("toasts.networkErrorRemovingMessage",),
      },);
    }
  },

  /**
   * @param {string} msgId
   * @param {Event} event
   * @returns {Promise<void>}
   */
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

  /**
   * @param {Event} event
   * @returns {Promise<void>}
   */
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
        const res = await apiFetch("/api/v1/assets", { method: "POST", body: formData, },);
        const asset = await res.json();
        this.pendingAssets = [...this.pendingAssets, { assetId: asset.id, filename: file.name, },];
        this.$dispatch?.("show-toast", {
          type: "success",
          message: t("toasts.readyToAttach", { filename: file.name, },),
        },);
      } catch (error) {
        // feFetch rejects every non-2xx with the status attached and drops the
        // response body, so a rejected upload is not a network fault.
        const status = error instanceof Error && "status" in error ? error.status : undefined;
        const key = status ? "toasts.failedUpload" : "toasts.networkErrorUploading";
        this.$dispatch?.("show-toast", {
          type: "error",
          message: t(key, { filename: file.name, },),
        },);
      }
    }

    input.value = "";
  },

  /**
   * @param {string} assetId
   * @returns {void}
   */
  removePendingAsset(assetId: string,) {
    const pending = this.pendingAssets;
    const filtered: typeof pending = [];
    for (const a of pending) { if (a.assetId !== assetId) { filtered.push(a,); } }
    this.pendingAssets = filtered;
  },
};
