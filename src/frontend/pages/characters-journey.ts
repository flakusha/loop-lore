// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Journey loader — detail modal (epic-character-growth).
 *
 * Fetches the arc stage + recent applied growth entries from the
 * character-growth API and renders them into `[data-field='journey']`.
 * Silently skips modals that predate the journey slot.
 */

import type { feFetch, } from "../fe-fetch";
import { escapeHtml, } from "./shared";

// Shared feFetch — caller passes it in to avoid circular import
let _feFetch: typeof feFetch;

/**
 * @param fetchFn
 * @returns {void}
 */
export function initJourney(fetchFn: typeof feFetch,) {
  _feFetch = fetchFn;
}

/**
 * Load the character's journey into the modal.
 * @param modal
 * @param id
 */
export async function loadCharacterJourney(modal: HTMLElement, id: string,): Promise<void> {
  const container = modal.querySelector<HTMLElement>("[data-field='journey']",);
  if (!container) { return; }
  try {
    const arcRes = await _feFetch(`/api/v1/character-growth/arc?actorId=${encodeURIComponent(id,)}`,);
    const arc = await arcRes.json() as {
      arc: { currentStage: string; stageDescription: string | null } | null;
    };

    if (!arc.arc) {
      container.innerHTML = "<div data-field='journey-empty'>No growth recorded yet.</div>";
      return;
    }

    const logRes = await _feFetch(
      `/api/v1/character-growth/growth-log?actorId=${encodeURIComponent(id,)}&limit=3`,
    );

    const log = await logRes.json() as {
      entries?: Array<{ axis: string; eventType: string; reason: string | null; recordedAt: string }>;
    };

    const entries = Array.isArray(log.entries,) ? log.entries : [];
    const items = entries.map((e,) =>
      `<li class="character-journey-entry"><span class="entry-axis">${
        escapeHtml(e.axis,)
      }</span> <span class="entry-reason">${escapeHtml(e.reason ?? "",)}</span> <span class="entry-time">${
        escapeHtml(e.recordedAt,)
      }</span></li>`
    ).join("",);

    container.innerHTML = `<div class="character-journey" data-testid="character-journey">` +
      `<h4 class="character-journey-title">Character Journey</h4>` +
      `<p class="character-journey-arc">Current arc: <strong>${escapeHtml(arc.arc.currentStage,)}</strong>` +
      (arc.arc.stageDescription ? ` — ${escapeHtml(arc.arc.stageDescription,)}` : "") +
      `</p>` +
      (items
        ? '<ul class="character-journey-entries">' + items + "</ul>"
        : '<p class="character-journey-empty">No growth recorded yet.</p>') +
      `</div>`;
  } catch {
    container.innerHTML = "<div data-field='journey-empty'>Journey unavailable.</div>";
  }
}
