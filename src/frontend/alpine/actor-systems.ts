// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 275

// ── Character systems export/import panel.
// Drives:
//   GET  /api/actors/:actorId/systems/export
//   POST /api/actors/:actorId/systems/import
//   POST /api/actors/:actorId/systems/import/url
// Pairs with `src/components/character/systems-panel.html`.
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, safeJsonParse, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "actor-systems", },);

export const EXPORT_SECTIONS = [
  "traits",
  "mood",
  "relationships",
  "avatars",
  "licensing",
  "availability",
  "worldSetup",
] as const;

/** Section id → human label. */
const SECTION_LABELS: Record<string, string> = {
  traits: "Traits",
  mood: "Mood",
  relationships: "Relationships",
  avatars: "Avatars",
  licensing: "Licensing",
  availability: "Availability",
  worldSetup: "World setup",
};

/** Section toggles for the export form. */
export type ExportSections = Record<typeof EXPORT_SECTIONS[number], boolean>;

/** Server-side import result shape. */
export interface ImportResult {
  success: boolean;
  imported: Record<string, number | boolean>;
  errors: string[];
}

const emptySections = (): ExportSections => ({
  traits: true,
  mood: true,
  relationships: true,
  avatars: true,
  licensing: true,
  availability: true,
  worldSetup: true,
});
const capitalize = (s: string,): string => s.charAt(0,).toUpperCase() + s.slice(1,);

/**
 * State plugin for the character-systems export/import panel. Bound to a
 * single actor via `setActorId`. Owns the section-toggle state, the export
 * download trigger, and the import (payload + URL) form.
 */
export interface ActorSystemsState {
  _sysActorId: string | null;
  sections: ExportSections;
  worldId: string;
  busy: boolean;
  message: string;
  error: string;
  importPreview: string;
  importUrl: string;
  importResult: ImportResult | null;
  setActorId(actorId: string,): void;
  /** Build the export body from `sections` + `worldId`. */
  buildExportBody(): Record<string, unknown>;
  /** Fetch the export payload as a `Blob` (default JSON format). */
  exportAsBlob(): Promise<Blob | null>;
  /** Trigger a browser download of the current export selection. */
  triggerDownload(): Promise<void>;
  /** Read the human label for a section id. */
  describeSection(section: string,): string;
  /** Import a JSON payload from `importPreview`. */
  importFromPayload(): Promise<void>;
  /** Fetch and import the URL in `importUrl` (SSRF-protected server-side). */
  importFromUrl(): Promise<void>;
  /** Clear the import status + form fields. */
  resetImport(): void;
}

export const actorSystems: ActorSystemsState = {
  _sysActorId: null,
  sections: emptySections(),
  worldId: "",
  busy: false,
  message: "",
  error: "",
  importPreview: "",
  importUrl: "",
  importResult: null,

  setActorId(actorId: string,) {
    if (this._sysActorId === actorId) { return; }
    this._sysActorId = actorId;
    this.sections = emptySections();
    this.worldId = "";
    this.busy = false;
    this.message = "";
    this.error = "";
    this.importPreview = "";
    this.importUrl = "";
    this.importResult = null;
  },

  buildExportBody() {
    const body: Record<string, unknown> = {};
    for (const key of EXPORT_SECTIONS) {
      body[`include${capitalize(key,)}`] = this.sections[key];
    }
    if (this.worldId) { body.worldId = this.worldId; }
    return body;
  },

  async exportAsBlob() {
    const actorId = this._sysActorId;
    if (!actorId) { return null; }
    try {
      const res = await apiFetch(`/api/actors/${actorId}/systems/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(this.buildExportBody(),),
      },);
      if (!res.ok) { return null; }
      return await res.blob();
    } catch (error) {
      log.error("Failed to export systems", error instanceof Error ? error : undefined, {},);
      return null;
    }
  },

  async triggerDownload() {
    const actorId = this._sysActorId;
    if (!actorId || this.busy) { return; }
    this.busy = true;
    this.error = "";
    try {
      const blob = await this.exportAsBlob();
      if (!blob) {
        this.error = t("status.systemsExportFailed",);
        return;
      }
      const url = URL.createObjectURL(blob,);
      const a = document.createElement("a",);
      a.href = url;
      a.download = `character-systems-${actorId}.json`;
      document.body.appendChild(a,);
      a.click();
      document.body.removeChild(a,);
      URL.revokeObjectURL(url,);
      this.message = t("status.systemsExportComplete",);
    } finally {
      this.busy = false;
    }
  },

  describeSection(section: string,) {
    return SECTION_LABELS[section] ?? section;
  },

  async importFromPayload() {
    const actorId = this._sysActorId;
    if (!actorId || this.busy) { return; }
    const raw = this.importPreview.trim();
    if (!raw) {
      this.error = t("status.systemsImportNoPayload",);
      return;
    }
    const result = safeJsonParse<unknown>(raw,);
    if (!result.ok) {
      this.error = t("status.systemsImportInvalidJson",);
      return;
    }
    const payload = result.value;
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const res = await apiFetch(`/api/actors/${actorId}/systems/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(payload as Record<string, unknown>,),
      },);
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as Record<string, unknown>)) as {
          message?: string;
        };
        this.error = body.message ?? t("status.systemsImportFailed",);
        return;
      }
      this.importResult = (await res.json()) as ImportResult;
      this.message = t("status.systemsImportComplete",);
    } catch (error) {
      log.error("Failed to import systems", error instanceof Error ? error : undefined, {},);
      this.error = t("status.systemsImportFailed",);
    } finally {
      this.busy = false;
    }
  },

  async importFromUrl() {
    const actorId = this._sysActorId;
    const url = this.importUrl.trim();
    if (!actorId || this.busy) { return; }
    if (!url) {
      this.error = t("status.systemsImportNoUrl",);
      return;
    }
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const res = await apiFetch(`/api/actors/${actorId}/systems/import/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ url, worldId: this.worldId || null, },),
      },);
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as Record<string, unknown>)) as {
          message?: string;
        };
        this.error = body.message ?? t("status.systemsImportFailed",);
        return;
      }
      this.importResult = (await res.json()) as ImportResult;
      this.message = t("status.systemsImportComplete",);
    } catch (error) {
      log.error("Failed to import systems from URL", error instanceof Error ? error : undefined, {},);
      this.error = t("status.systemsImportFailed",);
    } finally {
      this.busy = false;
    }
  },

  resetImport() {
    this.importPreview = "";
    this.importUrl = "";
    this.importResult = null;
    this.message = "";
    this.error = "";
  },
};

/** Build the Alpine scope for the systems panel partial. */
export function actorSystemsFactory(actorId: string,): ActorSystemsState {
  const state = Object.create(actorSystems,) as ActorSystemsState;
  state._sysActorId = null;
  state.sections = emptySections();
  state.worldId = "";
  state.busy = false;
  state.message = "";
  state.error = "";
  state.importPreview = "";
  state.importUrl = "";
  state.importResult = null;
  state.setActorId(actorId,);
  return state;
}

(globalThis as Record<string, unknown>).actorSystemsFactory = actorSystemsFactory;
