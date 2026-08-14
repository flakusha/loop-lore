import { destroyVnRenderer, initVnRenderer, type VnMessage, } from "../vn";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, safeJsonStringify, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, GmConfig, Message, } from "./types";

const log = rootLog.child({ module: "chat-settings", },);

/** Map a chat-page message to the VN renderer's message shape. */
function toVnMessage(m: Message,): VnMessage {
  const role = m.role as VnMessage["role"];
  const isVnRole = ["assistant", "user", "system",].includes(role,);
  return {
    id: m.id,
    role: isVnRole ? role : "narration",
    name: m.actor_name,
    content: m.content,
    thinking: m.thinking,
    attachments: m.attachments as VnMessage["attachments"],
  };
}

export const chatSettings: Partial<ChatState> & ThisType<ChatState> = {
  _chatSettingsName: "",
  _chatSettingsMode: "story",
  _chatSettingsTurnStrategy: "round_robin",
  _chatOnline: false,
  _selectedPersonaId: null as string | null,
  _impersonatingActorId: null as string | null,
  _assistantRole: "off",
  _gmType: "llm" as "llm" | "human" | "hybrid",
  _gmHumanActorId: "",
  _gmEscalationThreshold: 0.5,
  _gmModel: "",
  _gmProvider: "",
  _gmTemperature: 0.7,
  _gmMaxTokens: 2000,
  _chatParticipants: [] as { actor_id: string; name: string; display_name?: string }[],
  _personas: [] as any[],
  _debugView: false,
  // VN mode settings
  _vnEnabled: false,
  _vnLayout: "overlay" as "overlay" | "below" | "split",
  _vnTypewriter: true,
  _vnTypewriterSpeed: 30,
  _vnTransition: "fade" as "fade" | "cut" | "dissolve" | "slide" | "wipe",
  _vnAutoAdvance: false,

  toggleDebugView() {
    this._debugView = !this._debugView;
  },

  async openChatSettings() {
    const chats = this.chats;
    const chat = chats.find((c,) => c.id === this.activeChat);
    this._chatSettingsName = chat?.name ?? "";
    this._chatSettingsMode = chat?.mode ?? "story";
    this._chatSettingsTurnStrategy = chat?.turn_strategy ?? "round_robin";
    this._chatOnline = Array.isArray(this.messages,) && this.messages.some((m,) => m.status === "confirmed");
    this._groupPaused = this.isChatPaused(chat,);
    if (chat?.gm_config) {
      const config = jsonParseOr<GmConfig>(chat.gm_config, {},);
      this._assistantRole = config.assistantRole ?? "off";
      this._vnEnabled = config.visualNovel ?? false;
      this._vnLayout = config.vnLayout ?? "overlay";
      this._vnTypewriter = config.vnTypewriter ?? true;
      this._vnTypewriterSpeed = config.vnTypewriterSpeed ?? 30;
      this._vnTransition = config.vnTransition ?? "fade";
      this._vnAutoAdvance = config.vnAutoAdvance ?? false;
      this._gmType = config.type ?? "llm";
      this._gmHumanActorId = config.humanGM?.actorId ?? "";
      this._gmEscalationThreshold = config.escalationThreshold ?? 0.5;
      this._gmModel = config.llmConfig?.model ?? "";
      this._gmProvider = config.llmConfig?.provider ?? "";
      this._gmTemperature = config.llmConfig?.temperature ?? 0.7;
      this._gmMaxTokens = config.llmConfig?.maxTokens ?? 2000;
    }
    await this.loadChatParticipants();
    Alpine.store("ui",).showChatSettings = true;
  },

  /** Load chat participants for the human-GM actor selector. */
  async loadChatParticipants() {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants`,);
      if (res.ok) {
        this._chatParticipants = await res.json() as { actor_id: string; name: string; display_name?: string }[];
      }
    } catch {
      /* ignore */
    }
  },

  /**
   * (Re)render the active chat as a VN scene when VN mode is enabled, or tear
   * the renderer down when it is disabled. Reads the chat's persisted gm_config
   * so the renderer and the settings modal stay in sync.
   */
  updateVnMode() {
    const chat = this.chats.find((c: { id: string },) => c.id === this.activeChat);
    const config = chat?.gm_config
      ? jsonParseOr<GmConfig>(chat.gm_config, {},)
      : {};
    const enabled = config.visualNovel ?? this._vnEnabled;
    const container = document.querySelector<HTMLElement>("#vn-container",);

    if (!enabled || !container) {
      destroyVnRenderer();
      container?.replaceChildren();
      return;
    }

    const vnMessages = Array.from(this.messages, (m,) => toVnMessage(m,),);
    if (vnMessages.length === 0) {
      destroyVnRenderer();
      return;
    }
    initVnRenderer(container, vnMessages, config as Record<string, unknown>, this.activeChat ?? undefined,);
  },

  async saveChatSettings() {
    log.info("saveChatSettings", { chatId: this.activeChat, },);
    if (!this.activeChat || !this._chatSettingsName.trim()) { return; }
    try {
      const activeChatObj = this.chats.find((c,) => c.id === this.activeChat,);
      const existing = activeChatObj?.gm_config
        ? jsonParseOr<GmConfig>(activeChatObj.gm_config, {},)
        : {};
      const gmConfig: Record<string, unknown> = {
        ...existing,
        assistantRole: this._assistantRole,
        visualNovel: this._vnEnabled,
        vnLayout: this._vnLayout,
        vnTypewriter: this._vnTypewriter,
        vnTypewriterSpeed: this._vnTypewriterSpeed,
        vnTransition: this._vnTransition,
        vnAutoAdvance: this._vnAutoAdvance,
        type: this._gmType,
      };
      if (this._gmModel.trim()) {
        gmConfig.llmConfig = {
          model: this._gmModel.trim(),
          provider: this._gmProvider.trim(),
          systemPrompt: "",
          temperature: this._gmTemperature,
          maxTokens: this._gmMaxTokens,
        };
      } else {
        delete gmConfig.llmConfig;
      }
      if (this._gmType === "human" || this._gmType === "hybrid") {
        gmConfig.humanGM = { actorId: this._gmHumanActorId, notifications: true, };
      } else {
        delete gmConfig.humanGM;
      }
      if (this._gmType === "hybrid") {
        gmConfig.escalationThreshold = this._gmEscalationThreshold;
      } else {
        delete gmConfig.escalationThreshold;
      }
      const body: Record<string, unknown> = {
        name: this._chatSettingsName.trim(),
        isPaused: this._groupPaused,
      };
      // Key mechanics are immutable once the chat is online — the backend rejects
      // them with 409, so only send them for draft (offline) chats.
      if (!this._chatOnline) {
        body.mode = this._chatSettingsMode;
        body.turnStrategy = this._chatSettingsTurnStrategy;
        body.gmConfig = jsonBody(gmConfig,);
      }
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(body,),
      },);
      if (res.ok) {
        const chats = this.chats;
        const chat = chats.find((c,) => c.id === this.activeChat);
        if (chat) {
          chat.name = this._chatSettingsName.trim();
          chat.turn_strategy = this._chatSettingsTurnStrategy;
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
        // Re-init VN mode if toggle changed
        this.updateVnMode();
        this.$dispatch?.("show-toast", { type: "success", message: t("toasts.chatSettingsSaved",), },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedSaveSettings",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorSavingSettings",), },);
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
      await apiFetch(`/api/v1/chats/${this.activeChat}/persona`, {
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
        await apiFetch(`/api/v1/chats/${this.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ impersonateActorId: actorId, },),
        },);
      } else {
        await apiFetch(`/api/v1/chats/${this.activeChat}/impersonate`, {
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
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants`,);
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
