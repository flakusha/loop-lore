import { jsonBody, jsonParseOr, safeJsonStringify } from "./json";
import { log as rootLog } from "./logger";
import type { ChatState } from "./types";
import { apiFetch } from "./htmx";

const log = rootLog.child({ module: "chat" });

export const chatManagement: Partial<ChatState> & ThisType<ChatState> = {
  _renameChatId: "",
  _renameChatName: "",
  _chatSettingsName: "",
  _chatSettingsMode: "chat",
  _chatSettingsTurnStrategy: "round_robin",
  _groupPaused: false,
  _personas: [],
  _selectedPersonaId: null as string | null,
  _impersonatingActorId: null as string | null,
  _assistantRole: "off" as "off" | "helper" | "gm" | "moderator",

  async deleteChat(chatId: string, event: Event) {
    log.info("deleteChat", { chatId });
    if (!confirm("Delete this chat and all its messages?")) return;
    event.stopImmediatePropagation();
    const button = event.currentTarget as HTMLElement | null;
    try {
      const res = await apiFetch(`/api/chats/${chatId}`, { method: "DELETE" });
      if (res.ok) {
        const chats = this.chats;
        this.chats = chats.filter((c) => c.id !== chatId);
        if (this.activeChat === chatId) {
          this.activeChat = null;
          this.activeChatName = "Welcome to loop-lore";
          this.messages = [];
          Alpine.store("ui").hasActiveChat = false;
          const titleEl = document.querySelector("#page-title");
          if (titleEl) titleEl.textContent = this.activeChatName;
        }
        this.$dispatch?.("show-toast", { type: "success", message: "Chat deleted" });
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to delete chat" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error deleting chat" });
    }
    button?.blur();
  },

  openRenameModal(chatId: string) {
    log.info("openRenameModal", { chatId });
    const chats = this.chats;
    const chat = chats.find((c) => c.id === chatId);
    this._renameChatId = chatId;
    this._renameChatName = chat?.name ?? "Chat";
    Alpine.store("ui").showRenameModal = true;
  },

  async confirmRenameChat() {
    log.info("confirmRenameChat", { chatId: this._renameChatId });
    const chats = this.chats;
    const name = this._renameChatName.trim();
    if (!name || name === chats.find((c) => c.id === this._renameChatId)?.name) {
      Alpine.store("ui").showRenameModal = false;
      return;
    }
    try {
      const res = await apiFetch(`/api/chats/${this._renameChatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ name }),
      });
      if (res.ok) {
        const chat = chats.find((c) => c.id === this._renameChatId);
        if (chat) chat.name = name;
        if (this.activeChat === this._renameChatId) {
          this.activeChatName = name;
          const titleEl = document.querySelector("#page-title");
          if (titleEl) titleEl.textContent = name;
        }
        Alpine.store("ui").showRenameModal = false;
        this.$dispatch?.("show-toast", { type: "success", message: "Chat renamed" });
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to rename chat" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error renaming chat" });
    }
  },

  async renameChat(chatId: string) {
    this.openRenameModal(chatId);
  },

  async toggleChatPin(chatId: string) {
    const chats = this.chats;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;
    const pinned = !(chat.isPinned as number);
    try {
      const res = await apiFetch(`/api/chats/${chatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ isPinned: pinned }),
      });
      if (res.ok) {
        chat.isPinned = pinned ? 1 : 0;
        this.chats = [...chats];
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: "Failed to update pin state" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error updating pin state" });
    }
  },

  openChatSettings() {
    const chats = this.chats;
    const chat = chats.find((c) => c.id === this.activeChat);
    this._chatSettingsName = chat?.name ?? "";
    this._chatSettingsMode = chat?.mode ?? "chat";
    this._chatSettingsTurnStrategy = chat?.turn_strategy ?? "round_robin";
    this._groupPaused = this.isChatPaused(chat);
    // Load assistant role from chat settings if available
    if (chat?.gm_config) {
      try {
        const config = JSON.parse(chat.gm_config);
        this._assistantRole = (config.assistantRole as typeof this._assistantRole) || "off";
      } catch {}
    }
    Alpine.store("ui").showChatSettings = true;
  },

  isChatPaused(chat: any): boolean {
    if (!chat?.story_state) return false;
    const state = jsonParseOr<Record<string, unknown>>(chat.story_state, {});
    return state.isPaused === true;
  },

  get currentChat(): any {
    return this.chats.find((c) => c.id === this.activeChat) ?? null;
  },

  async toggleGroupPause() {
    const chat = this.currentChat;
    if (!chat || chat.type !== "group" || !this.activeChat) return;
    const newPaused = !this.isChatPaused(chat);
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}`, {
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
        this._groupPaused = newPaused;
        this.$dispatch?.("show-toast", {
          type: "success",
          message: newPaused ? "AI generation paused" : "AI generation resumed",
        });
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to toggle pause" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error toggling pause" });
    }
  },

  async loadChatParticipants() {
    if (!this.activeChat) return;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/participants`);
      if (res.ok) {
        this._chatParticipants = await res.json();
      }
    } catch {
      /* ignore */
    }
  },

  handleMentionInput(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;

    // Find @ before cursor
    const beforeCursor = value.slice(0, cursorPos);
    const atMatch = beforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      this._mentionQuery = atMatch[1].toLowerCase();
      this._showMentionAutocomplete = true;
      // Filter participants by name match
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
    const textarea = this.$refs?.messageInput as HTMLTextAreaElement | undefined;
    if (!textarea) return;

    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = value.slice(0, cursorPos);
    const afterCursor = value.slice(cursorPos);

    // Replace @query with @Name
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

  async saveChatSettings() {
    log.info("saveChatSettings", { chatId: this.activeChat });
    if (!this.activeChat || !this._chatSettingsName.trim()) return;
    try {
      // Build gm_config for assistant role
      const gmConfig = { assistantRole: this._assistantRole };
      const res = await apiFetch(`/api/chats/${this.activeChat}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({
          name: this._chatSettingsName.trim(),
          mode: this._chatSettingsMode,
          turnStrategy: this._chatSettingsTurnStrategy,
          isPaused: this._groupPaused,
          gmConfig: jsonBody(gmConfig),
        }),
      });
      if (res.ok) {
        const chats = this.chats;
        const chat = chats.find((c) => c.id === this.activeChat);
        if (chat) {
          chat.name = this._chatSettingsName.trim();
          chat.turn_strategy = this._chatSettingsTurnStrategy;
          // Update story_state with isPaused
          if (chat.story_state) {
            const state = jsonParseOr<Record<string, unknown>>(chat.story_state, {});
            state.isPaused = this._groupPaused;
            const serialized = safeJsonStringify(state);
            chat.story_state = serialized.ok ? serialized.value : chat.story_state;
          } else {
            const serialized = safeJsonStringify({ isPaused: this._groupPaused });
            chat.story_state = serialized.ok ? serialized.value : "{}";
          }
        }
        this.activeChatName = this._chatSettingsName.trim();
        const titleEl = document.querySelector("#page-title");
        if (titleEl) titleEl.textContent = this.activeChatName;
        Alpine.store("ui").showChatSettings = false;
        // Persist persona and impersonation settings
        this.setPersona();
        this.toggleImpersonation();
        this.$dispatch?.("show-toast", { type: "success", message: "Chat settings saved" });
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to save settings" });
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error saving settings" });
    }
  },

  async loadPersonas() {
    try {
      const res = await apiFetch("/api/personas");
      if (res.ok) {
        this._personas = await res.json();
      }
    } catch {
      /* ignore */
    }
  },

  async setPersona() {
    if (!this.activeChat) return;
    try {
      await apiFetch(`/api/chats/${this.activeChat}/persona`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ personaId: this._selectedPersonaId }),
      });
    } catch {
      /* non-critical */
    }
  },

  async toggleImpersonation() {
    if (!this.activeChat) return;
    const actorId = this._impersonatingActorId;
    try {
      if (this.impersonationActive && actorId) {
        await apiFetch(`/api/chats/${this.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({ impersonateActorId: actorId }),
        });
      } else {
        await apiFetch(`/api/chats/${this.activeChat}/impersonate`, {
          method: "DELETE",
        });
      }
    } catch {
      /* non-critical */
    }
  },

  async loadImpersonationState() {
    if (!this.activeChat || this._impersonationLoaded) return;
    this._impersonationLoaded = true;
    try {
      // Load persona and impersonation state from chat participant
      const res = await apiFetch(`/api/chats/${this.activeChat}/participants`);
      if (res.ok) {
        const participants = await res.json();
        const me = Array.isArray(participants)
          ? participants.find((p: any) => p.role_in_chat === "owner")
          : null;
        if (me) {
          this._selectedPersonaId = me.persona_id || null;
          this._impersonatingActorId = me.impersonate_actor_id || null;
          this.impersonationActive = !!me.impersonate_actor_id;
        }
      }
    } catch {
      /* ignore */
    }
    await this.loadPersonas();
  },
};