import { jsonBody, jsonParseOr, safeJsonStringify } from "./json";
import { log as rootLog } from "./logger";
import { apiFetch } from "./htmx";
import type { ChatState } from "./types";

const log = rootLog.child({ module: "chat-settings" });

export const chatSettings: Partial<ChatState> & ThisType<ChatState> = {
  _chatSettingsName: "",
  _chatSettingsMode: "chat",
  _chatSettingsTurnStrategy: "round_robin",
  _selectedPersonaId: null as string | null,
  _impersonatingActorId: null as string | null,
  _assistantRole: "off" as "off" | "helper" | "gm" | "moderator",
  _personas: [] as any[],

  openChatSettings() {
    const chats = this.chats;
    const chat = chats.find((c) => c.id === this.activeChat);
    this._chatSettingsName = chat?.name ?? "";
    this._chatSettingsMode = chat?.mode ?? "chat";
    this._chatSettingsTurnStrategy = chat?.turn_strategy ?? "round_robin";
    this._groupPaused = this.isChatPaused(chat);
    if (chat?.gm_config) {
      try {
        const config = JSON.parse(chat.gm_config);
        this._assistantRole = (config.assistantRole as "off" | "helper" | "gm" | "moderator") || "off";
      } catch {}
    }
    Alpine.store("ui").showChatSettings = true;
  },

  async saveChatSettings() {
    log.info("saveChatSettings", { chatId: this.activeChat });
    if (!this.activeChat || !this._chatSettingsName.trim()) return;
    try {
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
          if (chat.story_state) {
            const st = jsonParseOr<Record<string, unknown>>(chat.story_state, {});
            st.isPaused = this._groupPaused;
            const serialized = safeJsonStringify(st);
            chat.story_state = serialized.ok ? serialized.value : chat.story_state;
          } else {
            const serialized = safeJsonStringify({ isPaused: this._groupPaused });
            chat.story_state = serialized.ok ? serialized.value : "{}";
          }
          if (globalThis.Alpine) {
            try {
              Alpine.store("chat").currentChat = chat;
            } catch {
              /* store not ready */
            }
          }
        }
        this.activeChatName = this._chatSettingsName.trim();
        const titleEl = document.querySelector("#page-title");
        if (titleEl) titleEl.textContent = this.activeChatName;
        Alpine.store("ui").showChatSettings = false;
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
      if (res.ok) this._personas = await res.json();
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
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({ impersonateActorId: null }),
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
