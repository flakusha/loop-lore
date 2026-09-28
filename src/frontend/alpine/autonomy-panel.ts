// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Autonomy pacing panel (TASK-autonomy-config-surface).
//
// One component, two mounts: the world settings page edits the world
// layer, the chat settings modal edits the chat layer. Both read the
// same GET, so "inherited" and "overridden" mean the same thing in
// either place. Writes go through the existing world/chat PUTs rather
// than a bespoke save route - the layers are already writable there.
import type { AutonomyLayer, AutonomyOverride, AutonomyPanelState, AutonomyPayload, } from "./autonomy-panel-types";
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "autonomy-panel", },);

const EMPTY_DRAFT: AutonomyOverride = {};

/**
 * Field-by-field compare of a layer against a draft.
 *
 * Key-set rather than serialise-and-compare: a field the user cleared is
 * `undefined` in the draft and may be absent from the stored layer too,
 * and a stringify compare would call those different and arm Save on a
 * form nobody touched.
 *
 * @param stored the layer as the server has it
 * @param draft the layer as the form currently holds it
 * @returns true when any field differs
 */
function sameFields(stored: AutonomyOverride, draft: AutonomyOverride,): boolean {
  const keys = new Set([...Object.keys(stored,), ...Object.keys(draft,),],);
  for (const k of keys) {
    const field = k as keyof AutonomyOverride;
    if (stored[field] !== draft[field]) { return true; }
  }
  return false;
}

/**
 * Build the GET url for the panel's scope.
 *
 * @param worldId the world the panel is mounted on
 * @param chatId chat context, empty when the layer is the world itself
 * @param actorId character context, empty to omit the actor layer
 * @param scopeId the budget scope to report, empty to omit the budget
 * @returns the autonomy read url, with a query string when non-empty
 */
function readUrl(worldId: string, chatId: string, actorId: string, scopeId: string,): string {
  const qs = new URLSearchParams();
  if (chatId) { qs.set("chatId", chatId,); }
  if (actorId) { qs.set("actorId", actorId,); }
  if (scopeId) {
    qs.set("scopeKind", "user",);
    qs.set("scopeId", scopeId,);
  }
  const suffix = qs.toString();
  return `/api/worlds/${worldId}/autonomy${suffix ? `?${suffix}` : ""}`;
}

const panelState: AutonomyPanelState = {
  _autoWorldId: "",
  _autoChatId: "",
  _autoLayer: "world",
  _autoScopeId: "",
  _autoActorId: "",
  autoData: null,
  autoDraft: {},
  autoActorDraft: {},
  autoLoading: false,
  autoSaving: false,
  autoError: "",

  async init() {
    await this.load();
  },

  async load() {
    if (!this._autoWorldId) { return; }
    this.autoLoading = true;
    this.autoError = "";
    try {
      // feFetch throws on every non-2xx, so there is no status to
      // branch on here: a rejection below is the failure path.
      const res = await apiFetch(
        readUrl(this._autoWorldId, this._autoChatId, this._autoActorId, this._autoScopeId,),
      );
      const data = (await res.json()) as AutonomyPayload;
      this.autoData = data;
      // Editing starts from this layer's own values, not the merged
      // ones: pre-filling the form with inherited values would turn an
      // inherited field into an override the moment anyone saved.
      this.autoDraft = { ...data.layers[this._autoLayer], };
      this.autoActorDraft = { ...data.layers.actor, };
    } catch (error) {
      log.warn("Failed to load autonomy config", { error: String(error,), },);
      this.autoError = "Failed to load autonomy settings";
    } finally {
      this.autoLoading = false;
    }
  },

  async save() {
    if (!this._autoWorldId) { return; }
    this.autoSaving = true;
    this.autoError = "";
    try {
      // The world and chat layers already accept this field on their
      // existing PUTs, so the panel needs no save route of its own.
      const isChat = this._autoLayer === "chat";
      const url = isChat ? `/api/v1/chats/${this._autoChatId}` : `/api/worlds/${this._autoWorldId}`;
      await apiFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ autonomyConfig: this.autoDraft, },),
      },);
      await this.load();
    } catch (error) {
      log.warn("Failed to save autonomy config", { error: String(error,), },);
      this.autoError = "Failed to save autonomy settings";
    } finally {
      this.autoSaving = false;
    }
  },

  async saveActor() {
    if (!this._autoActorId) { return; }
    this.autoSaving = true;
    this.autoError = "";
    try {
      // The actor layer lives on the character's internal traits, which
      // already accept an `autonomy` block. Sending only that key keeps
      // the panel from clobbering the traits it does not own.
      // The traits route takes the actor as a query param, not a path segment.
      const qs = new URLSearchParams({ actorId: this._autoActorId, },);
      await apiFetch(`/api/character-internal-traits?${qs.toString()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ autonomyPreferences: { autonomy: this.autoActorDraft, }, },),
      },);
      await this.load();
    } catch (error) {
      log.warn("Failed to save actor autonomy", { error: String(error,), },);
      this.autoError = "Failed to save the character override";
    } finally {
      this.autoSaving = false;
    }
  },

  async control(action,) {
    if (!this._autoWorldId) { return; }
    this.autoError = "";
    try {
      await apiFetch(`/api/worlds/${this._autoWorldId}/autonomy/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ action, },),
      },);
      await this.load();
    } catch (error) {
      log.warn("Autonomy control failed", { error: String(error,), action, },);
      this.autoError = `Failed to ${action} autonomy`;
    }
  },

  async selectActor() {
    // Reread so the per-actor draft and the inherited hints describe the
    // character now selected, not the one selected when the page loaded.
    await this.load();
  },

  autoDirty() {
    return sameFields(this.autoData?.layers[this._autoLayer] ?? EMPTY_DRAFT, this.autoDraft,);
  },

  actorDirty() {
    return sameFields(this.autoData?.layers.actor ?? EMPTY_DRAFT, this.autoActorDraft,);
  },

  ownValue(field,) {
    const v = this.autoData?.layers[this._autoLayer]?.[field];
    return v === undefined ? "" : String(v,);
  },

  inheritedValue(field,) {
    const v = this.autoData?.resolved[field];
    if (v === null || v === undefined) { return "unlimited"; }
    if (field === "tickIntervalMs") { return `${Math.round(Number(v,) / 1000,)}s`; }
    return String(v,);
  },

  presetNames() {
    return Object.keys(this.autoData?.presets ?? {},);
  },
};

/**
 * Build the Alpine scope for the autonomy panel partial.
 *
 * @param opts the panel's mount: world, optional chat, layer, budget scope
 * @param opts.worldId the world to read config and caps from
 * @param opts.chatId chat context; its presence implies the chat layer
 * @param opts.layer which layer this mount edits and writes back
 * @param opts.scopeId budget scope to report, empty to omit the budget
 * @param opts.actorId character preselected in the per-actor editor
 * @returns a fresh panel state bound to that scope
 */
export function autonomyPanelFactory(
  opts: { worldId: string; chatId?: string; layer?: AutonomyLayer; scopeId?: string; actorId?: string },
): AutonomyPanelState {
  const state = Object.create(panelState,) as AutonomyPanelState;
  state._autoWorldId = opts.worldId;
  state._autoChatId = opts.chatId ?? "";
  state._autoLayer = opts.layer ?? (opts.chatId ? "chat" : "world");
  state._autoScopeId = opts.scopeId ?? "";
  state._autoActorId = opts.actorId ?? "";
  state.autoData = null;
  state.autoDraft = { ...EMPTY_DRAFT, };
  state.autoActorDraft = { ...EMPTY_DRAFT, };
  state.autoLoading = false;
  state.autoSaving = false;
  state.autoError = "";
  return state;
}

(globalThis as Record<string, unknown>).autonomyPanelFactory = autonomyPanelFactory;
