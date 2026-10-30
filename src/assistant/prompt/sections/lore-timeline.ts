// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * lore-timeline — timeline-event ground truth for lore reveal conditions
 * (084, epic-lore-knowledge). Extracted from `lore-load.ts` to keep that file
 * under the 250-line size limit.
 *
 * When at least one loaded secret's reveal condition has an `event` leaf, the
 * chat's timeline events are scanned (most recent first, bounded) so `lore.ts`
 * can evaluate those leaves against real ground truth; otherwise the query is
 * skipped entirely.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import {
  hasRevealCondition,
  parseRevealCondition,
  revealConditionNeedsEvents,
} from "../../lore/reveal-condition";
import type { LoreRow, } from "./lore-types";

/** Most recent timeline events scanned for reveal-condition `event` leaves. */
const MAX_REVEAL_TIMELINE_EVENTS = 500;

/** Timeline-event observations backing reveal-condition `event` leaves. */
export interface TimelineEventScan {
  /** Lowercased `event_type` values observed on the chat's timeline. */
  eventTypes: ReadonlySet<string>;
  /** Lowercased concatenation of those events' descriptions. */
  descriptionText: string;
}

/**
 * Scan the chat's timeline events (most recent first, bounded by
 * {@link MAX_REVEAL_TIMELINE_EVENTS}) when at least one loaded secret's
 * reveal condition has an `event` leaf; otherwise skip the query entirely.
 * @param db
 * @param worldId
 * @param timelineId
 * @param entries Loaded lore rows to inspect for event leaves.
 * @returns Event ground truth; empty when no condition needs it.
 * @throws {Error} Propagates query failures — reveal ground truth is required
 *   for correct fail-closed secret gating, so a read error must not be
 *   silently turned into "no events".
 */
export async function loadRevealTimelineEvents(
  db: Kysely<DB>,
  worldId: string | null,
  timelineId: string,
  entries: readonly LoreRow[],
): Promise<TimelineEventScan> {
  const anyNeedsEvents = entries.some((e,) => {
    if (!hasRevealCondition(e.reveal_condition,)) { return false; }
    const cond = parseRevealCondition(e.reveal_condition,);
    return cond !== null && revealConditionNeedsEvents(cond,);
  },);

  if (!anyNeedsEvents || worldId === null) {
    return { eventTypes: new Set<string>(), descriptionText: "", };
  }

  const rows = await db
    .selectFrom("world_timeline_events",)
    .select(["event_type", "description",],)
    .where("world_id", "=", worldId,)
    .where("timeline_id", "=", timelineId,)
    .orderBy("occurred_at", "desc",)
    .limit(MAX_REVEAL_TIMELINE_EVENTS,)
    .execute();

  const eventTypes = new Set<string>();
  const descriptions: string[] = [];
  for (const row of rows) {
    eventTypes.add(row.event_type.toLowerCase(),);
    descriptions.push(row.description.toLowerCase(),);
  }

  return { eventTypes, descriptionText: descriptions.join("\n",), };
}
