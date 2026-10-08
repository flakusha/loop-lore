// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 270

// ── Character extension editor panel state.
//
// Owns the per-actor draft of the canonical character's rich extension
// fields (abilities, inventory, vitals, equipment, motivations,
// relationships, appearance_details, speech_patterns, plugin_bundle).
// Generic over any bundle — the factory composes optional requirements at
// runtime (see `bundles.ts` in `src/plugins`).
//
// Ponytail note: the editor holds the canonical draft and serializes to
// the existing `PUT /api/actors/:actorId` `settings` payload. One round-trip.
// From the leaf module, NOT the `../../plugins` barrel: the barrel re-exports
// the plugin loader, and resolving it drags the whole backend into the frontend
// tsc project (ES2026 target, no `@/` paths).
import type { BundleCharacterRequirements, } from "../../plugins/types";
import { safeJsonParse, safeJsonStringify, } from "../../utils/safe-json";
import { autoResize as autoResizeImpl, } from "./auto-resize";
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "character-extension-editor", },);

/** Rich-extension payload; plain Record so the editor round-trips arbitrary JSON. */
export interface CharacterExtensionsPayload {
  abilities?: Record<string, number | string>;
  inventory?: Array<Record<string, unknown>>;
  vitals?: Record<string, number | string>;
  equipment?: Record<string, string>;
  motivations?: Array<Record<string, unknown>>;
  relationships?: Array<Record<string, unknown>>;
  appearance_details?: Record<string, unknown>;
  speech_patterns?: Record<string, unknown>;
  personality_traits?: Array<Record<string, unknown>>;
  conditions?: Array<Record<string, unknown>>;
  skills?: Array<Record<string, unknown>>;
  plugin_bundle?: string;
  alignment?: string;
  languages?: string[];
  [key: string]: unknown;
}

/** Bundle requirement check result (one `missing` entry per failure). */
export interface BundleValidationReport {
  valid: boolean;
  missing: string[];
}

/** Editor state — Alpine scope object. */
export interface CharacterExtensionEditorState {
  _cxActorId: string | null;
  _cxRequirements: BundleCharacterRequirements | undefined;
  /** Optional fetcher injection (tests pass a stub; production uses apiFetch). */
  _cxFetch?: (url: string, init?: RequestInit,) => Promise<Response>;
  /** Current extensions payload (last-fetched). */
  current: CharacterExtensionsPayload;
  /** Working draft the user edits. */
  draft: CharacterExtensionsPayload;
  /** Active bundle id (mirrors `draft.plugin_bundle`). */
  bundleId: string;
  loading: boolean;
  saving: boolean;
  error: string;
  message: string;
  /** Last validation report, populated by `validateAgainstBundle`. */
  validation: BundleValidationReport;

  setActorId(actorId: string,): void;
  setBundleRequirements(reqs: BundleCharacterRequirements | undefined,): void;
  load(): Promise<void>;
  reset(): void;
  validateAgainstBundle(): BundleValidationReport;
  serialize(): string;
  save(): Promise<void>;
  /** Resize a textarea to fit its content. */
  autoResize(el: HTMLTextAreaElement,): void;
}

const emptyPayload = (): CharacterExtensionsPayload => ({});

/**
 * Pure: build the JSON string posted to `PUT /api/actors/:actorId`.
 * @param draft
 */
export function serializeExtensions(
  draft: CharacterExtensionsPayload,
): string {
  const result = safeJsonStringify(draft,);
  return result.ok ? result.value : "{}";
}

/**
 * Pure: validate a draft against bundle requirements.
 * @param draft
 * @param requirements
 */
export function checkBundle(
  draft: CharacterExtensionsPayload,
  requirements: BundleCharacterRequirements | undefined,
): BundleValidationReport {
  const missing: string[] = [];
  const reqs = requirements?.required ?? [];
  for (const key of reqs) {
    const v = draft[key];
    if (v === undefined) {
      missing.push(`required: ${key}`,);
      continue;
    }

    const min = requirements?.minLength?.[key];
    if (typeof min === "number" && Array.isArray(v,) && v.length < min) {
      missing.push(`minLength: ${key} < ${min}`,);
    }
  }

  return { valid: missing.length === 0, missing, };
}

const seed: CharacterExtensionEditorState = {
  _cxActorId: null,
  _cxRequirements: undefined,
  current: emptyPayload(),
  draft: emptyPayload(),
  bundleId: "",
  loading: false,
  saving: false,
  error: "",
  message: "",
  validation: { valid: true, missing: [], },

  setActorId(actorId,) {
    if (this._cxActorId === actorId) { return; }
    this._cxActorId = actorId;
    this.current = emptyPayload();
    this.draft = emptyPayload();
    this.bundleId = "";
    this.error = "";
    this.message = "";
    this.validation = { valid: true, missing: [], };
  },

  setBundleRequirements(reqs,) {
    this._cxRequirements = reqs;
    this.validation = checkBundle(this.draft, reqs,);
  },

  async load() {
    const actorId = this._cxActorId;
    if (!actorId || this.loading) { return; }
    this.loading = true;
    this.error = "";
    try {
      const res = await (this._cxFetch ?? apiFetch)(`/api/v1/actors/${actorId}`, {},);
      if (!res.ok) {
        this.error = `Load failed (${res.status})`;
        return;
      }

      const body = (await res.json()) as { data?: { settings?: string } };
      // The server exposes canonical extensions through `settings` (the
      // UI/persona JSON blob); it may be undefined for new actors.
      const raw = body.data?.settings ?? "{}";
      const parsed = safeParse(raw,);
      this.current = parsed;
      this.draft = structuredClone(parsed,) as CharacterExtensionsPayload;
      this.bundleId = typeof parsed.plugin_bundle === "string" ? parsed.plugin_bundle : "";
      this.validation = checkBundle(this.draft, this._cxRequirements,);
    } catch (e) {
      log.error("load failed", e instanceof Error ? e : undefined, {},);
      this.error = `Load failed: ${e instanceof Error ? e.message : String(e,)}`;
    } finally {
      this.loading = false;
    }
  },

  reset() {
    this.draft = structuredClone(this.current,) as CharacterExtensionsPayload;
    this.validation = checkBundle(this.draft, this._cxRequirements,);
    this.message = "";
    this.error = "";
  },

  validateAgainstBundle() {
    this.validation = checkBundle(this.draft, this._cxRequirements,);
    return this.validation;
  },

  serialize() {
    return serializeExtensions(this.draft,);
  },

  async save() {
    const actorId = this._cxActorId;
    if (!actorId || this.saving) { return; }
    const report = checkBundle(this.draft, this._cxRequirements,);
    this.validation = report;
    if (!report.valid) {
      this.error = `Bundle requirements unmet: ${report.missing.join(", ",)}`;
      return;
    }

    this.saving = true;
    this.error = "";
    this.message = "";
    try {
      const payload = { settings: serializeExtensions(this.draft,), };
      const res = await (this._cxFetch ?? apiFetch)(`/api/v1/actors/${actorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(payload,),
      },);

      if (!res.ok) {
        this.error = `Save failed (${res.status})`;
        return;
      }

      this.current = structuredClone(this.draft,) as CharacterExtensionsPayload;
      this.message = "Saved";
    } catch (e) {
      log.error("save failed", e instanceof Error ? e : undefined, {},);
      this.error = `Save failed: ${e instanceof Error ? e.message : String(e,)}`;
    } finally {
      this.saving = false;
    }
  },

  autoResize(el: HTMLTextAreaElement,) {
    autoResizeImpl(el,);
  },
};

function safeParse(raw: string,): CharacterExtensionsPayload {
  if (!raw) { return emptyPayload(); }
  try {
    const result = safeJsonParse<CharacterExtensionsPayload>(raw,);
    if (result.ok && result.value && typeof result.value === "object" && !Array.isArray(result.value,)) {
      return result.value;
    }
  } catch { /* Fallthrough */ }

  return emptyPayload();
}

/**
 * Build a fresh editor instance bound to an actor.
 * @param actorId
 * @param requirements
 * @param fetcher
 */
export function characterExtensionEditorFactory(
  actorId: string,
  requirements: BundleCharacterRequirements | undefined,
  fetcher?: (url: string, init?: RequestInit,) => Promise<Response>,
): CharacterExtensionEditorState {
  const state = Object.create(seed,) as CharacterExtensionEditorState;
  state._cxActorId = null;
  state._cxRequirements = requirements;
  state._cxFetch = fetcher;
  state.current = emptyPayload();
  state.draft = emptyPayload();
  state.bundleId = "";
  state.loading = false;
  state.saving = false;
  state.error = "";
  state.message = "";
  state.validation = { valid: true, missing: [], };
  state.setActorId(actorId,);
  // Load() makes a network request; callers can await or ignore.
  void state.load();
  return state;
}

(globalThis as Record<string, unknown>).characterExtensionEditorFactory = characterExtensionEditorFactory;
(globalThis as Record<string, unknown>).serializeExtensions = serializeExtensions;
(globalThis as Record<string, unknown>).checkBundle = checkBundle;
