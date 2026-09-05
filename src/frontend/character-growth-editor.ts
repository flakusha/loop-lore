// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth Editor — Alpine.js component.
 *
 * Provides the client-side wiring for the author/GM growth editor:
 * - growth_mode radio toggle (PUT /api/actors/:actorId)
 * - llm_assist_enabled checkbox
 * - Arc stage editor (PATCH /api/character-growth/arc)
 * - Confirm/reject pending growth entries
 *   (POST /api/character-growth/growth-log/:entryId/confirm|reject)
 *
 * See .plan/epics/epic-character-growth.md (Frontend / UI section).
 *
 * Template attribute: x-data="characterGrowthEditor({ ... })"
 */

import { jsonBody, } from "./alpine/json";
import { feFetch, } from "./fe-fetch";

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
  saveMode(): Promise<void>;
  saveArc(): Promise<void>;
  confirmEntry(entryId: string,): Promise<void>;
  rejectEntry(entryId: string,): Promise<void>;
  /** @internal — mutates a growth-log row's status on the client binding. */
  _updateEntryStatus(entryId: string, status: "applied" | "rejected",): void;
}

/**
 * Build the Alpine component bound via x-data="characterGrowthEditor({ ... })".
 * @param opts
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

    async saveMode() {
      try {
        await feFetch(`/api/actors/${encodeURIComponent(this.actorId,)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            growthMode: this.growthMode,
            llmAssistEnabled: this.llmAssistEnabled,
          },),
        },);
        this.message = "Saved.";
      } catch (err) {
        this.message = "Failed to save growth mode.";
        // eslint-disable-next-line no-console
        console.error(err,);
      }
    },

    async saveArc() {
      try {
        const res = await feFetch(
          `/api/character-growth/arc/${encodeURIComponent(this.actorId,)}`,
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
        // eslint-disable-next-line no-console
        console.error(err,);
      }
    },

    async confirmEntry(entryId: string,) {
      try {
        await feFetch(
          `/api/character-growth/growth-log/${encodeURIComponent(entryId,)}/confirm?actorId=${
            encodeURIComponent(this.actorId,)
          }`,
          { method: "POST", },
        );
        this._updateEntryStatus(entryId, "applied",);
        this.message = "Entry confirmed.";
      } catch (err) {
        this.message = "Failed to confirm entry.";
        // eslint-disable-next-line no-console
        console.error(err,);
      }
    },

    async rejectEntry(entryId: string,) {
      try {
        await feFetch(
          `/api/character-growth/growth-log/${encodeURIComponent(entryId,)}/reject?actorId=${
            encodeURIComponent(this.actorId,)
          }`,
          { method: "POST", },
        );
        this._updateEntryStatus(entryId, "rejected",);
        this.message = "Entry rejected.";
      } catch (err) {
        this.message = "Failed to reject entry.";
        // eslint-disable-next-line no-console
        console.error(err,);
      }
    },

    _updateEntryStatus(entryId: string, status: "applied" | "rejected",) {
      const idx = this.entries.findIndex((e,) => e.id === entryId);
      if (idx >= 0) {
        this.entries[idx]!.status = status;
      }
    },
  };
}

// Expose globally for Alpine x-data binding (page bundles access via globalThis).
const g = globalThis as Record<string, unknown>;
g.characterGrowthEditor = characterGrowthEditor;
