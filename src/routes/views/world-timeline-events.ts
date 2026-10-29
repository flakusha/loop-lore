// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TimelineEntry, } from "../../story/timeline/world-timeline";
import { escapeHtml, } from "./layout";

/**
 * Cap on rendered timeline events in the world-detail fragment. The loader
 * fetches TIMELINE_EVENT_CAP + 1 rows so an over-cap branch is distinguishable
 * from an exactly-cap branch: the (CAP+1)th row proves truncation and is
 * never rendered.
 */
export const TIMELINE_EVENT_CAP = 50;

/**
 * Render the branch-scoped timeline events block for the detail fragment.
 * `events` may carry up to TIMELINE_EVENT_CAP + 1 entries; only the first
 * TIMELINE_EVENT_CAP are rendered, and the truncated note
 * (worlds.timelineTruncated) appears only when the extra row — i.e. real
 * truncation — exists.
 * @param events
 * @param branchName
 */
export function renderTimelineEvents(events: TimelineEntry[], branchName: string | null,): string {
  const heading = `Timeline events${branchName ? ` — ${escapeHtml(branchName,)}` : ""}`;
  if (events.length === 0) {
    return `<div class="form-group" style="margin-bottom:var(--space-6)">
      <label class="form-label">${heading}</label>
      <div class="empty-state" style="padding: var(--space-4); font-size: 13px">No timeline events on this branch</div>
    </div>`;
  }

  // Over-cap branches carry one extra probe row; render the capped slice only.
  const shown = events.slice(0, TIMELINE_EVENT_CAP,);
  const rows = shown
    .map(
      (entry,) =>
        `<div class="timeline-event">
        <span class="timeline-event-date">${escapeHtml(entry.occurred_at.slice(0, 10,),)}</span>
        <span class="timeline-event-desc">${escapeHtml(entry.description,)}</span>
      </div>`,
    )
    .join("",);

  // Truncated only when the probe row exists. The note carries the English
  // fallback inline; $t resolves worlds.timelineTruncated client-side after
  // the htmx swap.
  const truncatedNote = events.length > TIMELINE_EVENT_CAP
    ? `<div class="timeline-truncated" style="font-size: 12px; color: var(--text-secondary, #6c757d); margin-top: var(--space-2)" x-text="$t('worlds.timelineTruncated')">Showing first 50 events</div>`
    : "";

  return `<div class="form-group" style="margin-bottom:var(--space-6)">
    <label class="form-label">${heading}</label>
    <div class="timeline-events">${rows}</div>${truncatedNote}
  </div>`;
}
