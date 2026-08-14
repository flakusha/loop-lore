import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, safeJsonStringify, } from "./json";
import type { ChatState, } from "./types";

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
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- false positive: chat already null-checked above
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

  async loadChatParticipants() {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants`,);
      if (res.ok) { this._chatParticipants = await res.json(); }
    } catch {
      /* ignore */
    }
  },

  handleMentionInput(event: Event,) {
    const textarea = event.target as HTMLTextAreaElement;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = value.slice(0, cursorPos,);
    const atMatch = /@(\w*)$/.exec(beforeCursor,);
    if (atMatch) {
      this._mentionQuery = (atMatch[1] ?? "").toLowerCase();
      this._showMentionAutocomplete = true;
      this._mentionResults = [];
      for (const p of this._chatParticipants) {
        const name = (p.display_name || p.name || "").toLowerCase();
        if (name.includes(this._mentionQuery,)) { this._mentionResults.push(p,); }
      }
    } else {
      this._showMentionAutocomplete = false;
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
    const newBefore = beforeCursor.replace(/@\w*$/, () => `@${displayName} `,);
    textarea.value = newBefore + afterCursor;
    textarea.selectionStart = textarea.selectionEnd = newBefore.length;
    this._showMentionAutocomplete = false;
    this._mentionQuery = "";
    this._mentionResults = [];
    textarea.focus();
  },

  hideMentionAutocomplete() {
    this._showMentionAutocomplete = false;
    this._mentionQuery = "";
    this._mentionResults = [];
  },
};
