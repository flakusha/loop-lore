// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "../htmx";
import { jsonBody, } from "../json";
import type { ChatState, } from "../types";
import { _anonymousModeEnabled, } from "./anonymous";

/** */
export type ChatUtilsInteraction = Partial<ChatState> & ThisType<ChatState>;

export const chatUtilsInteraction: ChatUtilsInteraction = {
  openContextMenu(event: MouseEvent, msgId: string,) {
    event.preventDefault();
    event.stopPropagation();
    this._contextMenu = {
      visible: true,
      messageId: msgId,
      x: Math.min(event.clientX, window.innerWidth - 200,),
      y: Math.min(event.clientY, window.innerHeight - 300,),
    };
  },

  closeContextMenu() {
    this._contextMenu = { visible: false, messageId: null, x: 0, y: 0, };
  },

  openFlagDialog(contentType: "message" | "asset", contentId: string, chatId: string | null,) {
    this._flagDialog = { open: true, contentType, contentId, chatId, };
    this._flagReason = "";
    this._flagOther = "";
  },

  closeFlagDialog() {
    this._flagDialog.open = false;
  },

  async submitFlag() {
    const { contentType, contentId, chatId, } = this._flagDialog;
    if (!contentId) { return; }
    const flagReason = this._flagReason === "other" ? this._flagOther.trim() : this._flagReason;
    if (!flagReason) {
      showToast("error", t("chats.flagReasonRequired",),);
      return;
    }
    this._flagBusy = true;
    try {
      const res = await apiFetch("/api/nsfw/moderation/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          contentType,
          contentId,
          chatId: chatId ?? undefined,
          flagReason,
        },),
      },);
      if (res.ok) {
        showToast("success", t("chats.flagSubmitted",),);
        this.closeFlagDialog();
      } else {
        let errMsg: string | undefined;
        try {
          const err = await res.json();
          errMsg = err?.message;
        } catch { /* non-JSON error body */ }
        showToast("error", errMsg || t("chats.flagFailed",),);
      }
    } catch {
      showToast("error", t("chats.flagFailed",),);
    } finally {
      this._flagBusy = false;
    }
  },

  showReactionPicker(msgId: string, event: Event,) {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this._reactionPicker = {
      visible: true,
      messageId: msgId,
      x: Math.min(rect.left, window.innerWidth - 240,),
      y: Math.max(rect.top - 44, 8,),
    };
  },

  closeReactionPicker() {
    this._reactionPicker.visible = false;
  },

  displayName(msg: { role: string; actor_name?: string; actor_id?: string },): string {
    if (msg.role === "user") { return "You"; }
    if (msg.role === "system") { return "System"; }
    if (msg.role === "narration") { return "Narrator"; }

    // In anonymous mode, non-user messages show as "Anonymous"
    if (_anonymousModeEnabled && msg.role !== "user") {
      return "Anonymous";
    }

    return msg.actor_name || "Assistant";
  },
};
