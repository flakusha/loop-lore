import { apiFetch, } from "./htmx";
import { jsonBody, jsonParseOr, safeJsonStringify, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, GmConfig, } from "./types";

const log = rootLog.child({ module: "chat-settings", },);

export const chatSettings: Partial<ChatState> & ThisType<ChatState> = {
  _chatSettingsName: "",
  _chatSettingsMode: "chat",
  _chatSettingsTurnStrategy: "round_robin",
  _chatSettingsStreaming: "default" as "default" | "on" | "off",
  _selectedPersonaId: null as string | null,
  _impersonatingActorId: null as string | null,
  _assistantRole: "off",
  _personas: [] as any[],
  _debugView: false,

  toggleDebugView() {
    this._debugView = !this._debugView;
  },

  openChatSettings() {
    const chats = this.chats;
    const chat = chats.find((c,) => c.id === this.activeChat);
    this._chatSettingsName = chat?.name ?? "";
    this._chatSettingsMode = chat?.mode ?? "chat";
    this._chatSettingsTurnStrategy = chat?.turn_strategy ?? "round_robin";
    // Convert DB streaming value (1/0/null) to UI value ("on"/"off"/"default")
    const streamingVal = chat?.streaming;
    this._chatSettingsStreaming = streamingVal === 1 ? "on" : (streamingVal === 0 ? "off" : "default");
    this._groupPaused = this.isChatPaused(chat,);
    if (chat?.gm_config) {
      const config = jsonParseOr<GmConfig>(chat.gm_config, {},);
      this._assistantRole = config.assistantRole ?? "off";
    }
    Alpine.store("ui",).showChatSettings = true;
  },

  async saveChatSettings() {
    log.info("saveChatSettings", { chatId: this.activeChat, },);
    if (!this.activeChat || !this._chatSettingsName.trim()) { return; }
    try {
      const gmConfig = { assistantRole: this._assistantRole, };
      // Convert UI streaming value to DB value (true/false/null)
      const streamingValue = this._chatSettingsStreaming === "on"
        ? true
        : (this._chatSettingsStreaming === "off" ? false : null);
      const res = await apiFetch(`/api/chats/${this.activeChat}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          name: this._chatSettingsName.trim(),
          mode: this._chatSettingsMode,
          turnStrategy: this._chatSettingsTurnStrategy,
          isPaused: this._groupPaused,
          gmConfig: jsonBody(gmConfig,),
          streaming: streamingValue,
        },),
      },);
      if (res.ok) {
        const chats = this.chats;
        const chat = chats.find((c,) => c.id === this.activeChat);
        if (chat) {
          chat.name = this._chatSettingsName.trim();
          chat.turn_strategy = this._chatSettingsTurnStrategy;
          // Convert back to DB value for local state
          chat.streaming = streamingValue === true ? 1 : (streamingValue === false ? 0 : null);
          if (chat.story_state) {
            const st = jsonParseOr<Record<string, unknown>>(chat.story_state, {},);
            st.isPaused = this._groupPaused;
            const serialized = safeJsonStringify(st,);
            chat.story_state = serialized.ok ? serialized.value : chat.story_state;
          } else {
            const serialized = safeJsonStringify({ isPaused: this._groupPaused, },);
            chat.story_state = serialized.ok ? serialized.value : "{}";
          }
          if (globalThis.Alpine) {
            try {
              Alpine.store("chat",).currentChat = chat;
            } catch {
              /* store not ready */
            }
          }
        }
        this.activeChatName = this._chatSettingsName.trim();
        const titleEl = document.querySelector("#page-title",);
        if (titleEl) { titleEl.textContent = this.activeChatName; }
        Alpine.store("ui",).showChatSettings = false;
        this.setPersona();
        this.toggleImpersonation();
        this.$dispatch?.("show-toast", { type: "success", message: "Chat settings saved", },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to save settings", },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Network error saving settings", },);
    }
  },

  async loadPersonas() {
    try {
      const res = await apiFetch("/api/personas",);
      if (res.ok) { this._personas = await res.json(); }
    } catch {
      /* ignore */
    }
  },

  async setPersona() {
    if (!this.activeChat) { return; }
    try {
      await apiFetch(`/api/chats/${this.activeChat}/persona`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ personaId: this._selectedPersonaId, },),
      },);
    } catch {
      /* non-critical */
    }
  },

  async toggleImpersonation() {
    if (!this.activeChat) { return; }
    const actorId = this._impersonatingActorId;
    try {
      if (this.impersonationActive && actorId) {
        await apiFetch(`/api/chats/${this.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ impersonateActorId: actorId, },),
        },);
      } else {
        await apiFetch(`/api/chats/${this.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ impersonateActorId: null, },),
        },);
      }
    } catch {
      /* non-critical */
    }
  },

  async loadImpersonationState() {
    if (!this.activeChat || this._impersonationLoaded) { return; }
    this._impersonationLoaded = true;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/participants`,);
      if (res.ok) {
        const participants = await res.json();
        const me = Array.isArray(participants,)
          ? participants.find((p: any,) => p.role_in_chat === "owner")
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
