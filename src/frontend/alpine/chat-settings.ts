// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { OutputStylePreset, } from "../../chat/output-style";
import { buildGmConfig, readGmSettings, setStoryPaused, } from "./chat-settings/gm-config";
import { personaActions, } from "./chat-settings/persona";
import { syncVnRenderer, } from "./chat-settings/vn";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, GmConfig, } from "./types";

const log = rootLog.child({ module: "chat-settings", },);

export const chatSettings: Partial<ChatState> & ThisType<ChatState> = {
  ...personaActions,
  _chatSettingsName: "",
  _chatSettingsMode: "story",
  _chatSettingsTurnStrategy: "round_robin",
  _chatSettingsThinkingVisibility: "hidden" as "hidden" | "collapsed" | "visible",
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
  _actorModels: {} as Record<string, { model: string; provider: string }>,
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
  // Response length settings
  _responseLengthPreset: "medium" as "short" | "medium" | "long" | "custom",
  _responseLengthCustom: 1000,
  // Output styling (genre/register/tone)
  _outputStylePreset: "" as "" | OutputStylePreset,
  _outputStyleIntensity: 0.5,

  toggleDebugView() {
    this._debugView = !this._debugView;
  },

  async openChatSettings() {
    const chats = this.chats;
    const chat = chats.find((c,) => c.id === this.activeChat);
    this._chatSettingsName = chat?.name ?? "";
    this._chatSettingsMode = chat?.mode ?? "story";
    this._chatSettingsTurnStrategy = chat?.turn_strategy ?? "round_robin";
    this._chatSettingsThinkingVisibility = (chat?.thinking_visibility ?? "hidden") as
      | "hidden"
      | "collapsed"
      | "visible";
    this._chatOnline = Array.isArray(this.messages,) && this.messages.some((m,) => m.status === "confirmed");
    this._groupPaused = this.isChatPaused(chat,);
    await this.loadChatParticipants();
    const config = chat?.gm_config ? jsonParseOr<GmConfig>(chat.gm_config, {},) : {};
    const fields = readGmSettings(config,);
    this._assistantRole = fields.assistantRole;
    this._vnEnabled = fields.vnEnabled;
    this._vnLayout = fields.vnLayout;
    this._vnTypewriter = fields.vnTypewriter;
    this._vnTypewriterSpeed = fields.vnTypewriterSpeed;
    this._vnTransition = fields.vnTransition;
    this._vnAutoAdvance = fields.vnAutoAdvance;
    this._gmType = fields.gmType;
    this._gmHumanActorId = fields.gmHumanActorId;
    this._gmEscalationThreshold = fields.gmEscalationThreshold;
    this._gmModel = fields.gmModel;
    this._gmProvider = fields.gmProvider;
    this._gmTemperature = fields.gmTemperature;
    this._gmMaxTokens = fields.gmMaxTokens;
    this._responseLengthPreset = fields.responseLengthPreset;
    this._responseLengthCustom = fields.responseLengthCustom;
    this._outputStylePreset = fields.outputStylePreset;
    this._outputStyleIntensity = fields.outputStyleIntensity;
    // Seed per-actor model overrides from saved config (or empty defaults)
    // so the modal bindings have a stable object per participant.
    const actorModels: Record<string, { model: string; provider: string }> = {};
    for (const p of this._chatParticipants) {
      actorModels[p.actor_id] = config.actorModels?.[p.actor_id] ?? { model: "", provider: "", };
    }
    this._actorModels = actorModels;
    await this.loadPromptTemplate();
    this.loadQuickReplies();
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
    syncVnRenderer(this.messages, chat?.gm_config, this._vnEnabled, this.activeChat ?? undefined,);
  },

  async saveChatSettings() {
    log.info("saveChatSettings", { chatId: this.activeChat, },);
    if (!this.activeChat || !this._chatSettingsName.trim()) { return; }
    try {
      const activeChatObj = this.chats.find((c,) => c.id === this.activeChat);
      const existing = activeChatObj?.gm_config
        ? jsonParseOr<GmConfig>(activeChatObj.gm_config, {},)
        : {};
      const gmConfig = buildGmConfig(existing, {
        assistantRole: this._assistantRole,
        vnEnabled: this._vnEnabled,
        vnLayout: this._vnLayout,
        vnTypewriter: this._vnTypewriter,
        vnTypewriterSpeed: this._vnTypewriterSpeed,
        vnTransition: this._vnTransition,
        vnAutoAdvance: this._vnAutoAdvance,
        gmType: this._gmType,
        gmHumanActorId: this._gmHumanActorId,
        gmEscalationThreshold: this._gmEscalationThreshold,
        gmModel: this._gmModel,
        gmProvider: this._gmProvider,
        gmTemperature: this._gmTemperature,
        gmMaxTokens: this._gmMaxTokens,
        responseLengthPreset: this._responseLengthPreset,
        responseLengthCustom: this._responseLengthCustom,
        outputStylePreset: this._outputStylePreset,
        outputStyleIntensity: this._outputStyleIntensity,
      }, this._actorModels,);
      const body: Record<string, unknown> = {
        name: this._chatSettingsName.trim(),
        isPaused: this._groupPaused,
        thinkingVisibility: this._chatSettingsThinkingVisibility,
        outputStylePreset: this._outputStylePreset,
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
          setStoryPaused(chat, this._groupPaused,);
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
};
