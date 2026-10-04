// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-discovery/events.ts — append + read the world event log
 *
 * One function writes, one function lists. Both are the only places in
 * the codebase that touch `world_event_log`, so the two invariants the
 * tick depends on live here and nowhere else:
 *
 *   1. EVERY event carries a `dedupeKey` and is inserted
 *      `ON CONFLICT (dedupe_key) DO NOTHING`. Idempotency is therefore a
 *      storage-layer property, not a convention a future writer has to
 *      remember: a replayed tick that re-derives the same event loses the
 *      insert and reports `false`. That is what makes "exactly once" hold
 *      across the crash-and-replay the scheduler performs
 *      (`src/autonomy/scheduler/README.md`, Persistence).
 *   2. The listing's ORDER BY is TOTAL (`tick_index DESC, id ASC`). Two
 *      events on one tick must never swap places between pages or between
 *      runs, and `id` is the only unique tie-break available.
 */
import { jsonStringifyOr, } from "../../utils/safe-json";
import type { DiscoveryDb, WorldEventInput, WorldEventListQuery, WorldEventPage, } from "./types";

/** Hard ceiling on a page, so a caller cannot ask for the whole log. */
const MAX_PAGE_SIZE = 200;

/** Columns the listing returns. Kept in one place so row and select agree. */
const LISTED_COLUMNS = [
  "id",
  "world_id",
  "event_type",
  "subject_id",
  "actor_id",
  "payload",
  "tick_index",
  "created_at",
] as const;

/**
 * Append one event to the log.
 *
 * The insert is idempotent on `dedupeKey`, so callers MUST derive the key
 * from the tick and the subject rather than from anything that varies
 * between two runs of the same tick — a timestamp or a random id would
 * let a replay append a twin.
 *
 * @param db widened database handle
 * @param event the event to append, including its dedupe key
 * @returns true when the row was newly appended, false when the key was taken
 */
export async function emitWorldEvent(db: DiscoveryDb, event: WorldEventInput,): Promise<boolean> {
  const result = await db
    .insertInto("world_event_log",)
    .values({
      world_id: event.worldId,
      event_type: event.eventType,
      subject_id: event.subjectId,
      actor_id: event.actorId,
      tick_index: event.tick,
      payload: jsonStringifyOr(event.payload,),
      dedupe_key: event.dedupeKey,
    },)
    .onConflict((oc,) => oc.column("dedupe_key",).doNothing())
    .executeTakeFirst();

  // SQLite reports 0 affected rows when the conflict clause fires, so this
  // is the "did I actually write?" signal for a replayed tick.
  return Number(result?.numInsertedOrUpdatedRows ?? 0n,) === 1;
}

/**
 * Dedupe key for a discovery. Scoped to the LOCATION, not the tick: a
 * location is charted once for the life of the world, and two actors
 * crossing the threshold on the same tick must produce one event between
 * them.
 */
export function discoveredKey(worldId: string, locationId: string,): string {
  return `discovered:${worldId}:${locationId}`;
}

/**
 * Dedupe key for a convoy. Scoped to the tick AND the party: a convoy is
 * legitimately in motion on many ticks, and each is its own event, but a
 * replay of the same tick is not.
 */
export function tradeRouteKey(worldId: string, tick: number, partyId: string,): string {
  return `trade-route:${worldId}:${tick}:${partyId}`;
}

/**
 * One page of the event log, newest tick first.
 *
 * Read-only: the admin panel is a viewer, and nothing in this file
 * mutates. `worldId` is required — the log is world-scoped and an
 * unfiltered read would scan every world in the database.
 */
export async function listWorldEvents(db: DiscoveryDb, query: WorldEventListQuery,): Promise<WorldEventPage> {
  const pageSize = Math.min(Math.max(1, query.pageSize,), MAX_PAGE_SIZE,);
  const page = Math.max(1, query.page,);

  // Total order: tick_index is not unique, so `id` breaks ties.
  let rows = db.selectFrom("world_event_log",).select(LISTED_COLUMNS,).where("world_id", "=", query.worldId,);
  if (query.eventType) { rows = rows.where("event_type", "=", query.eventType,); }

  // Sequential, not Promise.all: both are read-only counts, so overlap buys
  // nothing and Promise.all would leave the first rejection unobserved once
  // the other branch also fails. Awaiting in order means a failed count
  // throws to the caller instead of stranding the page query's rejection.
  const data = await rows
    .orderBy("tick_index", "desc",)
    .orderBy("id", "asc",)
    .limit(pageSize,)
    .offset((page - 1) * pageSize,)
    .execute();

  const counted = await rows.select((eb,) => eb.fn.countAll<string>().as("total",)).executeTakeFirst();

  return { data, total: Number(counted?.total ?? 0,), page, pageSize, };
}
