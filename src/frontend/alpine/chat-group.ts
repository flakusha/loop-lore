// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, safeJsonStringify, } from "./json";
import type { ChatState, } from "./types";

const mentionTokenRe = /@([\p{L}\p{N}_-]*)$/u;

export const chatGroup: Partial<ChatState> & ThisType<ChatState> = {
  _groupPaused: false,
  _mentionQuery: "",
  _mentionResults: [] as {
    actor_id: string;
    name: string;
    display_name?: string;
    actor_type?: string;
  }[],
  _showMentionAutocomplete: false,
  _mentionActiveIndex: 0,
  _chatParticipants: [] as {
    actor_id: string;
    name: string;
    display_name?: string;
    actor_type?: string;
  }[],

  isChatPaused(chat: any,): boolean {
    if (!chat?.story_state) { return false; }
    const state = jsonParseOr<Record<string, unknown>>(chat.story_state, {},);
    return state.isPaused === true;
  },

  async toggleGroupPause() {
    const chat = this.currentChat;

    if (!chat || chat.type !== "group" || !this.activeChat) { return; }
    const newPaused = !this.isChatPaused(chat,);
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ isPaused: newPaused, },),
      },);
      if (res.ok) {
        if (chat.story_state) {
          const state = jsonParseOr<Record<string, unknown>>(chat.story_state, {},);
          state.isPaused = newPaused;
          const serialized = safeJsonStringify(state,);
          chat.story_state = serialized.ok ? serialized.value : chat.story_state;
        } else {
          const serialized = safeJsonStringify({ isPaused: newPaused, },);
          chat.story_state = serialized.ok ? serialized.value : "{}";
        }
        this._groupPaused = newPaused;
        if (globalThis.Alpine) {
          try {
            Alpine.store("chat",).currentChat = chat;
          } catch {
            /* store not ready */
          }
        }
        this.$dispatch?.("show-toast", {
          type: "success",
          message: t(newPaused ? "toasts.aiPaused" : "toasts.aiResumed",),
        },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedTogglePause",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorTogglingPause",), },);
    }
  },

  handleMentionInput(event: Event,) {
    const textarea = event.target as HTMLTextAreaElement;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = value.slice(0, cursorPos,);
    const atMatch = mentionTokenRe.exec(beforeCursor,);
    if (atMatch) {
      this._mentionQuery = (atMatch[1] ?? "").toLowerCase();
      this._showMentionAutocomplete = true;
      this._mentionActiveIndex = 0;
      this._mentionResults = [];
      for (const p of this._chatParticipants) {
        const name = (p.display_name || p.name || "").toLowerCase();
        if (name.includes(this._mentionQuery,)) { this._mentionResults.push(p,); }
      }
    } else {
      this._showMentionAutocomplete = false;
      this._mentionActiveIndex = 0;
      this._mentionQuery = "";
      this._mentionResults = [];
    }
  },

  selectMention(participant: { actor_id: string; name: string },) {
    const textarea = this.$refs.messageInput as HTMLTextAreaElement | undefined;
    if (!textarea) { return; }
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = value.slice(0, cursorPos,);
    const afterCursor = value.slice(cursorPos,);
    const displayName = participant.name || participant.actor_id;
    const newBefore = beforeCursor.replace(mentionTokenRe, () => `@${displayName} `,);
    textarea.value = newBefore + afterCursor;
    textarea.selectionStart = textarea.selectionEnd = newBefore.length;
    this._showMentionAutocomplete = false;
    this._mentionActiveIndex = 0;
    this._mentionQuery = "";
    this._mentionResults = [];
    textarea.focus();
  },

  hideMentionAutocomplete() {
    this._showMentionAutocomplete = false;
    this._mentionActiveIndex = 0;
    this._mentionQuery = "";
    this._mentionResults = [];
  },

  acceptMentionAtIndex(index: number,) {
    const entry = this._mentionResults[index];
    if (!entry) { return; }
    this.selectMention(entry,);
  },

  moveMentionSelection(delta: 1 | -1,) {
    const count = this._mentionResults.length;
    if (count === 0) { return; }
    this._mentionActiveIndex = (this._mentionActiveIndex + delta + count) % count;
  },

  handleComposerEnter() {
    if (this._showMentionAutocomplete && this._mentionResults.length > 0) {
      this.acceptMentionAtIndex(this._mentionActiveIndex,);
      return;
    }
    if (this._showCommandPalette && this._filteredCommands.length > 0) {
      this.acceptPaletteAtIndex(this._paletteActiveIndex,);
      return;
    }
    void this.sendMessage().catch(() => {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedSend",), },);
    },);
  },

  handleComposerKeydown(event: KeyboardEvent,) {
    const target = event.target as { tagName?: string } | null;
    if (!target || target.tagName !== "TEXTAREA") { return; }
    if (event.isComposing) { return; }
    if (this._showMentionAutocomplete) {
      if (this._mentionResults.length > 0) {
        if (event.key === "Tab") {
          event.preventDefault();
          this.acceptMentionAtIndex(this._mentionActiveIndex,);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          this.moveMentionSelection(1,);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          this.moveMentionSelection(-1,);
        } else if (event.key === "Escape") {
          this.hideMentionAutocomplete();
        }
        return;
      }
      if (event.key === "Escape") {
        this.hideMentionAutocomplete();
        return;
      }
    }
    if (this._showCommandPalette) {
      if (event.key === "Escape") {
        this._showCommandPalette = false;
        return;
      }
      if (this._filteredCommands.length === 0) { return; }
      if (event.key === "Tab") {
        event.preventDefault();
        if (event.shiftKey) { this.movePaletteSelection(-1,); }
        else { this.acceptPaletteAtIndex(this._paletteActiveIndex,); }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        this.movePaletteSelection(1,);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.movePaletteSelection(-1,);
      }
    }
  },
};
