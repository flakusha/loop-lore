// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Growth & Arc section — character edit form (epic-character-growth).
 *
 * Server-rendered from the actors row + character_arc + recent applied
 * growth_log rows so the editor works with no extra fetch round-trip.
 * The Alpine `characterGrowthEditor` factory
 * (src/frontend/character-growth-editor.ts) drives the growth-mode
 * toggle, LLM-assist toggle, and arc-stage save.
 */

import { jsonStringifyOr, } from "../../utils/safe-json";
import { escapeHtml, } from "./escape-html";

/** Input values for the growth section */
export interface GrowthSectionValues {
  characterId: string;
  growthMode: string;
  llmAssistEnabled: boolean;
  arcStage: string;
  arcDescription: string;
  dataVersion: number;
  /** Recent applied growth entries, newest first (server-rendered, player-safe) */
  recentEntries: Array<{ axis: string; reason: string; recordedAt: string }>;
}

/** Human label for an arc stage value.
 * @param stage - arc stage value
 * @returns display label
 */
function stageLabel(stage: string,): string {
  switch (stage) {
    case "rising_action":
      return "Rising Action";
    case "crisis":
      return "Crisis";
    case "resolution":
      return "Resolution";
    case "epilogue":
      return "Epilogue";
    default:
      return "Introduction";
  }
}

/**
 * Collapsible Growth & Arc section HTML.
 * @param v - growth values
 * @param escapeAttr - attribute escaper shared with the form builder
 * @returns the growth section HTML
 */
export function growthSection(
  v: GrowthSectionValues,
  escapeAttr: (str: string,) => string,
): string {
  const stages = ["introduction", "rising_action", "crisis", "resolution", "epilogue",];
  const options = stages.map((s,) =>
    `<option value="${s}"${v.arcStage === s ? " selected" : ""}>${escapeHtml(stageLabel(s,),)}</option>`
  ).join("",);

  const recent = v.recentEntries.length > 0
    ? `<ul class="growth-recent-entries">${
      v.recentEntries.map((e,) =>
        `<li class="growth-recent-entry"><span class="entry-axis">${
          escapeHtml(e.axis,)
        }</span> <span class="entry-reason">${escapeHtml(e.reason,)}</span> <span class="entry-time">${
          escapeHtml(e.recordedAt,)
        }</span></li>`
      ).join("",)
    }</ul>`
    : `<p class="growth-recent-empty">No growth recorded yet.</p>`;

  return `        <details class="form-section" data-testid="character-growth-section" style="margin-top:var(--space-4);border:1px solid var(--border-default);border-radius:var(--radius-md);padding:var(--space-4)">
          <summary style="cursor:pointer;font-weight:600;font-size:var(--text-lg)">Growth &amp; Arc</summary>
          <p class="form-hint" style="color:var(--text-secondary);margin:var(--space-2) 0 var(--space-4)">Whether this character changes through the story — and how. Static mode blocks skill/trait/relationship drift.</p>
          <div x-data="characterGrowthEditor({ actorId: '${escapeAttr(v.characterId,)}', initialMode: '${
    escapeAttr(v.growthMode,)
  }', initialLlmAssist: ${v.llmAssistEnabled ? "true" : "false"}, initialArcStage: '${
    escapeAttr(v.arcStage,)
  }', initialArcDescription: ${
    escapeAttr(jsonStringifyOr(v.arcDescription, '""',),)
  }, initialEntries: [], dataVersion: ${v.dataVersion} })" data-testid="character-growth-editor">
            <fieldset class="growth-mode-fieldset">
              <legend>Growth Mode</legend>
              <label><input type="radio" name="growth_mode" value="dynamic" x-model="growthMode" data-testid="growth-mode-dynamic" /> Dynamic — character may evolve through the story</label>
              <label><input type="radio" name="growth_mode" value="static" x-model="growthMode" data-testid="growth-mode-static" /> Static — character does not change</label>
              <button @click="saveMode()" type="button" data-testid="save-growth-mode">Save</button>
            </fieldset>
            <label class="llm-assist-toggle"><input type="checkbox" x-model="llmAssistEnabled" data-testid="llm-assist-toggle" /> Enable LLM-assist (proposes pending growth entries)</label>
            <fieldset class="arc-editor">
              <legend>Arc Stage</legend>
              <select x-model="arcStage" data-testid="arc-stage-select">${options}</select>
              <textarea x-model="arcDescription" placeholder="Stage description (optional)" data-testid="arc-description"></textarea>
              <button @click="saveArc()" type="button" data-testid="save-arc">Save Arc</button>
            </fieldset>
            <div class="growth-recent" data-testid="character-growth-entries">${recent}</div>
            <div x-show="message" class="growth-editor-message" x-text="message" data-testid="growth-editor-message"></div>
          </div>
        </details>`;
}
