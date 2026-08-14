/**
 * GM Guidance — human Game Master narrative steering for story chats.
 *
 * Self-contained Alpine component (x-data="gmGuidance") holding the guidance
 * state and persistence. Kept separate from `chatSettings` to respect the
 * per-feature file-size budget; the settings modal nests this component inside
 * its GM Guidance section.
 *
 * Persists via `PUT /api/v1/chats/:id/gm-guidance` — a runtime-patchable
 * endpoint that is NOT subject to the online key-mechanic lock, so a GM can
 * steer an in-progress story.
 */

import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";
import { log as rootLog, } from "./logger";
import type { GmConfig, GmGuidance, GmTurnPriority, } from "./types";

const log = rootLog.child({ module: "gm-guidance", },);

/** Resolve the active chat id from the global Alpine `chat` store. */
function activeChatId(): string | null {
  const alpine = (globalThis as { Alpine?: { store: (name: string,) => Record<string, unknown> } }).Alpine;
  const chat = alpine?.store("chat",) as { currentChat?: { id?: string } } | undefined;
  return chat?.currentChat?.id ?? null;
}

interface GmGuidanceComponent {
  $dispatch?: (event: string, detail?: unknown,) => void;
  $nextTick?: (callback?: () => void,) => Promise<void>;
  _storyMode: boolean;
  _gmGuidance: GmGuidance;
  _gmNewConstraint: string;
  _gmGuidanceLoading: boolean;
  _gmParticipants: { actor_id: string; name: string; display_name?: string; actor_type?: string }[];
  init(): Promise<void>;
  loadGmParticipants(): Promise<void>;
  addGmConstraint(): void;
  removeGmConstraint(constraint: string,): void;
  setGmTurnPriority(actorId: string, level: GmTurnPriority,): void;
  applyGmGuidance(): Promise<void>;
  clearGmGuidance(): Promise<void>;
}

(globalThis as unknown as Record<string, unknown>).gmGuidance = function(): GmGuidanceComponent {
  const component: GmGuidanceComponent = {
    _storyMode: false,
    _gmGuidance: { constraints: [], turnPriority: {}, },
    _gmNewConstraint: "",
    _gmGuidanceLoading: false,
    _gmParticipants: [],

    /** Load guidance + participants for the active chat. */
    async init() {
      const chatId = activeChatId();
      if (!chatId) { return; }
      try {
        const res = await apiFetch(`/api/v1/chats/${chatId}`, { headers: { Accept: "application/json", }, },);
        if (!res.ok) { return; }
        const chat = await res.json() as { gm_config?: string; mode?: string };
        const config = jsonParseOr<GmConfig>(chat.gm_config ?? "{}", {},);
        this._storyMode = config.storyMode ?? false;
        this._gmGuidance = config.gmGuidance ?? { constraints: [], turnPriority: {}, };
        if (chat.mode === "story") {
          await this.loadGmParticipants();
        }
      } catch (error) {
        log.warn("Failed to load GM guidance", { error, },);
      }
    },

    async loadGmParticipants() {
      const chatId = activeChatId();
      if (!chatId) { return; }
      try {
        const res = await apiFetch(`/api/v1/chats/${chatId}/participants`,);
        if (res.ok) {
          this._gmParticipants = await res.json() as {
            actor_id: string;
            name: string;
            display_name?: string;
            actor_type?: string;
          }[];
        }
      } catch {
        /* ignore */
      }
    },

    addGmConstraint() {
      const c = this._gmNewConstraint.trim();
      if (!c) { return; }
      if (!this._gmGuidance.constraints.includes(c,)) {
        this._gmGuidance = {
          ...this._gmGuidance,
          constraints: [...this._gmGuidance.constraints, c,],
        };
      }
      this._gmNewConstraint = "";
    },

    removeGmConstraint(constraint: string,) {
      const kept: string[] = [];
      for (const c of this._gmGuidance.constraints) {
        if (c !== constraint) { kept.push(c,); }
      }
      this._gmGuidance = { ...this._gmGuidance, constraints: kept, };
    },

    setGmTurnPriority(actorId: string, level: GmTurnPriority,) {
      this._gmGuidance = {
        ...this._gmGuidance,
        turnPriority: { ...this._gmGuidance.turnPriority, [actorId]: level, },
      };
    },

    async applyGmGuidance() {
      const chatId = activeChatId();
      if (!chatId) { return; }
      this._gmGuidanceLoading = true;
      try {
        const res = await apiFetch(`/api/v1/chats/${chatId}/gm-guidance`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ storyMode: this._storyMode, gmGuidance: this._gmGuidance, },),
        },);
        if (res.ok) {
          this.$dispatch?.("show-toast", { type: "success", message: t("toasts.gmGuidanceApplied",), },);
        } else {
          const err = await res.json();
          this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.gmGuidanceFailed",), },);
        }
      } catch {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorSavingSettings",), },);
      } finally {
        this._gmGuidanceLoading = false;
      }
    },

    async clearGmGuidance() {
      this._gmGuidance = { constraints: [], turnPriority: {}, };
      this._gmNewConstraint = "";
      await this.applyGmGuidance();
    },
  };
  return component;
};
