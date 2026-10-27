// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth Editor — Alpine.js component.
 *
 * Provides the client-side wiring for the author/GM growth editor:
 * - growth_mode radio toggle (PUT /api/v1/actors/:actorId)
 * - llm_assist_enabled checkbox
 * - Arc stage editor (PATCH /api/v1/character-growth/arc)
 * - Confirm/reject pending growth entries
 *   (POST /api/v1/character-growth/growth-log/:entryId/confirm|reject)
 *
 * See .plan/epics/epic-character-growth.md (Frontend / UI section).
 *
 * Template attribute: x-data="characterGrowthEditor({ ... })"
 */

import { autoResize as autoResizeImpl, } from "./alpine/auto-resize";
import { jsonBody, } from "./alpine/json";
import { log as rootLog, } from "./alpine/logger";
import { feFetch, } from "./fe-fetch";

const log = rootLog.child({ module: "character-growth-editor", },);

/** Growth-log entry row rendered by the partial. */
export interface GrowthLogEntry {
  id: string;
  recordedAt: string;
  axis: string;
  eventType: string;
  reason: string;
  /** pending | applied | rejected */
  status: string;
}

/** Options injected from the partial template into `characterGrowthEditor(...)`. */
export interface CharacterGrowthEditorOptions {
  actorId: string;
  initialMode: string;
  initialLlmAssist: boolean;
  initialArcStage: string;
  initialArcDescription: string;
  initialEntries: GrowthLogEntry[];
  /** Optimistic-concurrency version from GET /api/v1/actors/:actorId (CHAR-1). */
  contentVersion?: number;
}

/** Alpine x-data component object (methods bound to `this`). */
export interface CharacterGrowthEditorComponent {
  actorId: string;
  growthMode: string;
  llmAssistEnabled: boolean;
  arcStage: string;
  arcDescription: string;
  entries: GrowthLogEntry[];
  message: string;
  /** Latest known actors.row_version; refreshed from the PUT response. */
  contentVersion?: number;
  saveMode(): Promise<void>;
  saveArc(): Promise<void>;
  confirmEntry(entryId: string,): Promise<void>;
  rejectEntry(entryId: string,): Promise<void>;
  /** @internal — mutates a growth-log row's status on the client binding. */
  _updateEntryStatus(entryId: string, status: "applied" | "rejected",): void;
  /** Resize a textarea to fit its content. */
  autoResize(el: HTMLTextAreaElement,): void;
}

/**
 * Build the Alpine component bound via x-data="characterGrowthEditor({ ... })".
 * @param opts
 * @throws {Error}
 * @returns {CharacterGrowthEditorComponent}
 */
export function characterGrowthEditor(opts: CharacterGrowthEditorOptions,): CharacterGrowthEditorComponent {
  return {
    actorId: opts.actorId,
    growthMode: opts.initialMode,
    llmAssistEnabled: Boolean(opts.initialLlmAssist,),
    arcStage: opts.initialArcStage || "introduction",
    arcDescription: opts.initialArcDescription || "",
    entries: Array.isArray(opts.initialEntries,) ? opts.initialEntries : [],
    message: "",
    contentVersion: opts.contentVersion,

    /**
     * @returns {Promise<void>}
     */
    async saveMode() {
      try {
        const res = await feFetch(`/api/v1/actors/${encodeURIComponent(this.actorId,)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            growthMode: this.growthMode,
            llmAssistEnabled: this.llmAssistEnabled,
            // CHAR-1: the actors PUT requires the version from the prior GET.
            ...(this.contentVersion !== undefined ? { contentVersion: this.contentVersion, } : {}),
          },),
        },);

        const data = await res.json().catch(() => null) as { contentVersion?: number } | null;
        if (typeof data?.contentVersion === "number") { this.contentVersion = data.contentVersion; }
        this.message = "Saved.";
      } catch (err) {
        this.message = "Failed to save growth mode.";
        log.error("Failed to save growth mode.", err instanceof Error ? err : undefined, {},);
      }
    },

    /**
     * @throws {Error}
     * @returns {Promise<void>}
     */
    async saveArc() {
      try {
        const res = await feFetch(
          `/api/v1/character-growth/arc?actorId=${encodeURIComponent(this.actorId,)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({
              currentStage: this.arcStage,
              stageDescription: this.arcDescription,
            },),
          },
        );

        if (!res.ok) { throw new Error(`HTTP ${res.status}`,); }
        this.message = "Arc saved.";
      } catch (err) {
        this.message = "Failed to save arc.";
        log.error("Failed to save arc.", err instanceof Error ? err : undefined, {},);
      }
    },

    /**
     * @param {string} entryId
     * @returns {Promise<void>}
     */
    async confirmEntry(entryId: string,) {
      try {
        await feFetch(
          `/api/v1/character-growth/growth-log/${encodeURIComponent(entryId,)}/confirm?actorId=${
            encodeURIComponent(this.actorId,)
          }`,
          { method: "POST", },
        );

        this._updateEntryStatus(entryId, "applied",);
        this.message = "Entry confirmed.";
      } catch (err) {
        this.message = "Failed to confirm entry.";
        log.error("Failed to confirm entry.", err instanceof Error ? err : undefined, {},);
      }
    },

    /**
     * @param {string} entryId
     * @returns {Promise<void>}
     */
    async rejectEntry(entryId: string,) {
      try {
        await feFetch(
          `/api/v1/character-growth/growth-log/${encodeURIComponent(entryId,)}/reject?actorId=${
            encodeURIComponent(this.actorId,)
          }`,
          { method: "POST", },
        );

        this._updateEntryStatus(entryId, "rejected",);
        this.message = "Entry rejected.";
      } catch (err) {
        this.message = "Failed to reject entry.";
        log.error("Failed to reject entry.", err instanceof Error ? err : undefined, {},);
      }
    },

    /**
     * @param {string} entryId
     * @param {"applied" | "rejected"} status
     * @returns {void}
     */
    _updateEntryStatus(entryId: string, status: "applied" | "rejected",) {
      const idx = this.entries.findIndex((e,) => e.id === entryId);
      if (idx >= 0) {
        this.entries[idx]!.status = status;
      }
    },

    autoResize(el: HTMLTextAreaElement,) {
      autoResizeImpl(el,);
    },
  };
}

// Expose globally for Alpine x-data binding (page bundles access via globalThis).
const g = globalThis as Record<string, unknown>;
g.characterGrowthEditor = characterGrowthEditor;
