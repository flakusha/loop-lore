import { jsonBody, jsonParseOr, safeJsonStringify } from "./json";
import { log as rootLog } from "./logger";
import { apiFetch } from "./htmx";

const log = rootLog.child({ module: "chat-group" });

export const chatGroup = {
  _groupPaused: false,
  _mentionQuery: "",
  _mentionResults: [] as Array<{
    actor_id: string;
    name: string;
    display_name?: string;
    actor_type?: string;
  }>,
  _showMentionAutocomplete: false,
  _chatParticipants: [] as Array<{
    actor_id: string;
    name: string;
    display_name?: string;
    actor_type?: string;
  }>,

  isChatPaused(chat: any): boolean {
    if (!chat?.story_state) return false;
    const state = jsonParseOr<Record<string, unknown>>(chat.story_state, {});
    return state.isPaused === true;
  },

  async toggleGroupPause() {
    const s = this as any;
    const chat = s.currentChat;
    if (!chat || chat.type !== "group" || !s.activeChat) return;
    const newPaused = !s.isChatPaused(chat);
    try {
      const res = await apiFetch(`/api/chats/${s.activeChat}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ isPaused: newPaused }),
      });
      if (res.ok) {
        if (chat.story_state) {
          const state = jsonParseOr<Record<string, unknown>>(chat.story_state, {});
          state.isPaused = newPaused;
          const serialized = safeJsonStringify(state);
          chat.story_state = serialized.ok ? serialized.value : chat.story_state;
        } else {
          const serialized = safeJsonStringify({ isPaused: newPaused });
          chat.story_state = serialized.ok ? serialized.value : "{}";
        }
        s._groupPaused = newPaused;
        if (globalThis.Alpine) {
          try {
            Alpine.store("chat").currentChat = chat;
          } catch {
            /* store not ready */
          }
        }
        s.$dispatch?.("show-toast", {
          type: "success",
          message: newPaused ? "AI generation paused" : "AI generation resumed",
        });
      } else {
        const err = await res.json();
        s.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to toggle pause" });
      }
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Network error toggling pause" });
    }
  },

  async loadChatParticipants() {
    const s = this as any;
    if (!s.activeChat) return;
    try {
      const res = await apiFetch(`/api/chats/${s.activeChat}/participants`);
      if (res.ok) s._chatParticipants = await res.json();
    } catch {
      /* ignore */
    }
  },

  handleMentionInput(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = value.slice(0, cursorPos);
    const atMatch = beforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      this._mentionQuery = atMatch[1].toLowerCase();
      this._showMentionAutocomplete = true;
      this._mentionResults = this._chatParticipants.filter((p: any) => {
        const name = (p.display_name || p.name || "").toLowerCase();
        return name.includes(this._mentionQuery);
      });
    } else {
      this._showMentionAutocomplete = false;
      this._mentionQuery = "";
      this._mentionResults = [];
    }
  },

  selectMention(participant: { actor_id: string; name: string }) {
    const textarea = (this as any).$refs?.messageInput as HTMLTextAreaElement | undefined;
    if (!textarea) return;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = value.slice(0, cursorPos);
    const afterCursor = value.slice(cursorPos);
    const displayName = participant.name || participant.actor_id;
    const newBefore = beforeCursor.replace(/@\w*$/, () => `@${displayName} `);
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
