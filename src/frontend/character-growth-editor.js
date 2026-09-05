// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth Editor — Alpine.js component.
 *
 * Provides the client-side wiring for the author/GM growth editor:
 * - growth_mode radio toggle (PATCH /api/actors/:actorId)
 * - llm_assist_enabled checkbox
 * - Arc stage editor (PATCH /api/character-growth/arc)
 * - Confirm/reject pending growth entries
 *   (POST /api/character-growth/growth-log/:entryId/confirm|reject)
 *
 * See .plan/epics/epic-character-growth.md (Frontend / UI section).
 *
 * Template attribute: x-data="characterGrowthEditor({ ... })"
 */
import { jsonStringifyOr, safeFetch, } from "../utils";

/**
 * @param {{ actorId: string, initialMode: string, initialLlmAssist: boolean,
 *           initialArcStage: string, initialArcDescription: string,
 *           initialEntries: Array<object> }} opts
 */
function characterGrowthEditor(opts,) {
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
        const result = await safeFetch(`/api/actors/${encodeURIComponent(this.actorId,)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonStringifyOr({
            growthMode: this.growthMode,
            llmAssistEnabled: this.llmAssistEnabled,
          },),
        },);
        if (!result.ok) { throw new Error(result.error.message,); }
        this.message = "Saved.";
      } catch (err) {
        this.message = "Failed to save growth mode.";
        console.error(err,);
      }
    },

    async saveArc() {
      try {
        const result = await safeFetch(
          `/api/character-growth/arc/${encodeURIComponent(this.actorId,)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", },
            body: jsonStringifyOr({
              currentStage: this.arcStage,
              stageDescription: this.arcDescription,
            },),
          },
        );
        if (!result.ok) { throw new Error(result.error.message,); }
        this.message = "Arc saved.";
      } catch (err) {
        this.message = "Failed to save arc.";
        console.error(err,);
      }
    },

    async confirmEntry(entryId,) {
      try {
        const result = await safeFetch(
          `/api/character-growth/growth-log/${encodeURIComponent(entryId,)}/confirm?actorId=${
            encodeURIComponent(this.actorId,)
          }`,
          { method: "POST", },
        );
        if (!result.ok) { throw new Error(result.error.message,); }
        this._updateEntryStatus(entryId, "applied",);
        this.message = "Entry confirmed.";
      } catch (err) {
        this.message = "Failed to confirm entry.";
        console.error(err,);
      }
    },

    async rejectEntry(entryId,) {
      try {
        const result = await safeFetch(
          `/api/character-growth/growth-log/${encodeURIComponent(entryId,)}/reject?actorId=${
            encodeURIComponent(this.actorId,)
          }`,
          { method: "POST", },
        );
        if (!result.ok) { throw new Error(result.error.message,); }
        this._updateEntryStatus(entryId, "rejected",);
        this.message = "Entry rejected.";
      } catch (err) {
        this.message = "Failed to reject entry.";
        console.error(err,);
      }
    },

    _updateEntryStatus(entryId, status,) {
      const idx = this.entries.findIndex((e,) => e.id === entryId);
      if (idx >= 0) {
        this.entries[idx].status = status;
      }
    },
  };
}

// Expose globally for Alpine x-data binding.
window.characterGrowthEditor = characterGrowthEditor;
