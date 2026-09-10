// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** */
export interface ConvergentEventsOpts {
  db: Kysely<DB>;
  worldId: string;
  excludeStoryId: string;
  since?: string;
  limit?: number;
}

/**
 * Recent world timeline entries from OTHER stories (docs/spec/lore.md §5.4).
 * Sibling-chat consequences propagate into the shared world context;
 * audience filtering stays with the prompt layer. Entries are newest first.
 * @param root0
 * @param root0.db
 * @param root0.worldId
 * @param root0.excludeStoryId
 * @param root0.since
 * @param root0.limit
 */
export async function getConvergentEvents(
  { db, worldId, excludeStoryId, since, limit, }: ConvergentEventsOpts,
) {
  let query = db
    .selectFrom("world_timeline_events",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where((eb,) =>
      eb.or([
        eb("story_id", "!=", excludeStoryId,),
        eb("story_id", "is", null,),
      ],)
    );
  if (since !== undefined) {
    query = query.where("occurred_at", ">", since,);
  }
  return query
    .orderBy("occurred_at", "desc",)
    .limit(limit ?? 20,)
    .execute();
}
