// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Event Application — Apply Dispatcher
 *
 * applyEvents: iterate validated events, apply each via its handler,
 * collect per-event results, and persist successes to the timeline.
 */
import { ItemsService, } from "../../items";
import { appendTimelineEvents, } from "../../timeline";
import type { WorldEvent, } from "../../types";
import { applySingleEvent, } from "./handlers";
import type { AppliedEvent, ApplyEventsOpts, } from "./types";

/** Apply validated events to the DB */
export async function applyEvents({ db, worldId, events, trx, storyId, }: ApplyEventsOpts,): Promise<AppliedEvent[]> {
  const database = trx ?? db;
  const results: AppliedEvent[] = [];
  const items = new ItemsService(database,);

  for (const event of events) {
    try {
      results.push(await applySingleEvent(database, worldId, items, event,),);
    } catch (error) {
      results.push({
        event,
        applied: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },);
    }
  }

  // Persist successfully applied events to the world timeline (docs/spec/lore.md §5).
  const successfulEvents: WorldEvent[] = [];
  for (const r of results) {
    if (r.applied) { successfulEvents.push(r.event,); }
  }
  if (successfulEvents.length > 0) {
    await appendTimelineEvents({
      db: database,
      worldId,
      storyId: storyId ?? null,
      events: successfulEvents,
    },);
  }

  return results;
}
