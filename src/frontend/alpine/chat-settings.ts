import { jsonBody, jsonParseOr, safeJsonStringify } from "./json";
import { log as rootLog } from "./logger";
import { apiFetch } from "./htmx";

const log = rootLog.child({ module: "chat-settings" });

export const chatSettings = {
  _chatSettingsName: "",
  _chatSettingsMode: "chat",
  _chatSettingsTurnStrategy: "round_robin",
  _selectedPersonaId: null as string | null,
  _impersonatingActorId: null as string | null,
  _assistantRole: "off" as "off" | "helper" | "gm" | "moderator",
  _personas: [] as any[],

  openChatSettings() {
    const s = this as any;
    const chats = s.chats;
    const chat = chats.find((c: any) => c.id === s.activeChat);
    s._chatSettingsName = chat?.name ?? "";
    s._chatSettingsMode = chat?.mode ?? "chat";
    s._chatSettingsTurnStrategy = chat?.turn_strategy ?? "round_robin";
    s._groupPaused = s.isChatPaused(chat);
    if (chat?.gm_config) {
      try {
        const config = JSON.parse(chat.gm_config);
        s._assistantRole = (config.assistantRole as "off" | "helper" | "gm" | "moderator") || "off";
      } catch {}
    }
    Alpine.store("ui").showChatSettings = true;
  },

  async saveChatSettings() {
    const s = this as any;
    log.info("saveChatSettings", { chatId: s.activeChat });
    if (!s.activeChat || !s._chatSettingsName.trim()) return;
    try {
      const gmConfig = { assistantRole: s._assistantRole };
      const res = await apiFetch(`/api/chats/${s.activeChat}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({
          name: s._chatSettingsName.trim(),
          mode: s._chatSettingsMode,
          turnStrategy: s._chatSettingsTurnStrategy,
          isPaused: s._groupPaused,
          gmConfig: jsonBody(gmConfig),
        }),
      });
      if (res.ok) {
        const chats = s.chats;
        const chat = chats.find((c: any) => c.id === s.activeChat);
        if (chat) {
          chat.name = s._chatSettingsName.trim();
          chat.turn_strategy = s._chatSettingsTurnStrategy;
          if (chat.story_state) {
            const st = jsonParseOr<Record<string, unknown>>(chat.story_state, {});
            st.isPaused = s._groupPaused;
            const serialized = safeJsonStringify(st);
            chat.story_state = serialized.ok ? serialized.value : chat.story_state;
          } else {
            const serialized = safeJsonStringify({ isPaused: s._groupPaused });
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
        s.activeChatName = s._chatSettingsName.trim();
        const titleEl = document.querySelector("#page-title");
        if (titleEl) titleEl.textContent = s.activeChatName;
        Alpine.store("ui").showChatSettings = false;
        s.setPersona();
        s.toggleImpersonation();
        s.$dispatch?.("show-toast", { type: "success", message: "Chat settings saved" });
      } else {
        const err = await res.json();
        s.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to save settings" });
      }
    } catch {
      s.$dispatch?.("show-toast", { type: "error", message: "Network error saving settings" });
    }
  },

  async loadPersonas() {
    try {
      const res = await apiFetch("/api/personas");
      if (res.ok) (this as any)._personas = await res.json();
    } catch {
      /* ignore */
    }
  },

  async setPersona() {
    const s = this as any;
    if (!s.activeChat) return;
    try {
      await apiFetch(`/api/chats/${s.activeChat}/persona`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ personaId: s._selectedPersonaId }),
      });
    } catch {
      /* non-critical */
    }
  },

  async toggleImpersonation() {
    const s = this as any;
    if (!s.activeChat) return;
    const actorId = s._impersonatingActorId;
    try {
      if (s.impersonationActive && actorId) {
        await apiFetch(`/api/chats/${s.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({ impersonateActorId: actorId }),
        });
      } else {
        await apiFetch(`/api/chats/${s.activeChat}/impersonate`, {
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
    const s = this as any;
    if (!s.activeChat || s._impersonationLoaded) return;
    s._impersonationLoaded = true;
    try {
      const res = await apiFetch(`/api/chats/${s.activeChat}/participants`);
      if (res.ok) {
        const participants = await res.json();
        const me = Array.isArray(participants)
          ? participants.find((p: any) => p.role_in_chat === "owner")
          : null;
        if (me) {
          s._selectedPersonaId = me.persona_id || null;
          s._impersonatingActorId = me.impersonate_actor_id || null;
          s.impersonationActive = !!me.impersonate_actor_id;
        }
      }
    } catch {
      /* ignore */
    }
    await s.loadPersonas();
  },
};
