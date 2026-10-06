// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-discovery/progress.ts — one actor's chart progress at one location
 *
 * The `location_discovery` row and nothing else: read the world's rows,
 * recompute one row's progress at a tick, write it, latch it once charted.
 * Split out of ./discovery.ts so that file is the tick loop and this one
 * is the row it loops over. The tick's replay argument lives there; the
 * rules below are what make it hold.
 *
 * RECOMPUTE, NEVER INCREMENT
 * --------------------------
 * The obvious `progress = progress + GAIN` is wrong the moment the process
 * crashes, because the scheduler replays at most one world tick after a
 * crash and an increment applies twice for one tick of real time. So
 * progress is recomputed from stored state and elapsed ticks:
 *
 *     newProgress = clamp(progress + rate(present, T) * elapsed, 0, 100)
 *     elapsed      = T - last_explored_tick
 *
 * and the write is guarded by `WHERE last_explored_tick < T`. A replayed
 * tick finds `last_explored_tick == T` and matches no rows, so it is a
 * no-op by construction rather than by a flag someone has to remember to
 * set.
 *
 * NO RNG
 * ------
 * Nothing here draws from the scheduler's tick stream: accrual is a pure
 * function of (stored progress, tick index), and a draw would couple
 * discovery to the registration order of every other target on the tick.
 */

import type { NotNull, } from "kysely";
import { toDate, } from "../../utils/date";
import type { DiscoveryDb, } from "./types";

/** Progress gained per tick by an NPC standing in the location. */
export const EXPLORE_GAIN = 4;

/** Progress bled per tick the location is NOT being explored. */
export const DECAY_PER_TICK = 0.5;

/** Progress needed to chart a location. Matches epic-world-locations' 0-100. */
export const DISCOVERY_THRESHOLD = 100;

/** Progress row, as this module needs it. */
export interface ProgressRow {
  location_id: string;
  actor_id: string;
  progress: number;
  last_explored_tick: number;
  discovered: number;
}

/** An NPC's current whereabouts. */
export interface Presence {
  actor_id: string;
  location_id: string;
}

/** What one row's recomputation decided. */
export interface Recomputed {
  /** Progress to persist. */
  progress: number;
  /** True when this row crossed the threshold for the first time. */
  fresh: boolean;
}

/**
 * Recompute one row's progress at `tick`.
 *
 * Pure — no clock, no RNG, no DB. This is the whole replay argument: the
 * same (progress, lastTick, present, tick) always yields the same number, so
 * a replay writes the value it would have written anyway and the guard in
 * the UPDATE is what stops it writing twice.
 * @param row
 * @param present
 * @param tick
 */
export function recompute(row: ProgressRow, present: boolean, tick: number,): Recomputed {
  const elapsed = Math.max(1, tick - row.last_explored_tick,);
  const rate = present ? EXPLORE_GAIN - DECAY_PER_TICK : -DECAY_PER_TICK;
  const progress = Math.min(DISCOVERY_THRESHOLD, Math.max(0, row.progress + rate * elapsed,),);
  return { progress, fresh: !row.discovered && progress >= DISCOVERY_THRESHOLD, };
}

/**
 * SQLite has no date type; the rest of the schema stores `datetime('now')`.
 * @param nowMs
 */
function stamp(nowMs: number,): string {
  return toDate(nowMs,).toISOString().replace("T", " ",).slice(0, 19,);
}

/**
 * Read every NPC's location in the world, in a total order.
 *
 * `ORDER BY actor_id ASC` is load-bearing. The scheduler's RNG rule
 * (`docs/spec/autonomy-determinism.md`, and the same reasoning in
 * `travel.ts`) is that a row's identity may not depend on the order the DB
 * happened to hand rows back: a restore that reorders the scan would move
 * progress between actors. `actor_id` is a unique column, so the order is
 * total and identical on every run.
 * @param db
 * @param worldId
 */
export async function readPresence(db: DiscoveryDb, worldId: string,): Promise<Presence[]> {
  return db
    .selectFrom("npc_states",)
    .select(["actor_id", "location_id",],)
    .where("world_id", "=", worldId,)
    .where("location_id", "is not", null,)
    .orderBy("actor_id", "asc",)
    // An actor with no location is NOT present anywhere, so the filter
    // above is what makes `location_id` non-null. Kysely cannot see that
    // through `is not`, hence the explicit narrow — widening `Presence`
    // instead would push a `string | null` into every pair key.
    .$narrowType<{ location_id: NotNull }>()
    .execute();
}

/**
 * Read the world's progress rows, in a total order.
 *
 * Also the `ORDER BY` that makes the write loop reproducible: the recompute
 * of row 2 must not depend on whether row 1 won a conflict.
 * @param db
 * @param worldId
 */
export async function readProgress(db: DiscoveryDb, worldId: string,): Promise<ProgressRow[]> {
  return db
    .selectFrom("location_discovery",)
    .select(["location_id", "actor_id", "progress", "last_explored_tick", "discovered",],)
    .where("world_id", "=", worldId,)
    .orderBy("location_id", "asc",)
    .orderBy("actor_id", "asc",)
    .execute();
}

/**
 * Persist one row's recomputed progress, or create it.
 *
 * Both branches are idempotent for a replayed tick. The UPDATE carries the
 * `last_explored_tick < tick` guard; the INSERT cannot re-fire because the
 * composite primary key collides and the conflict clause discards it. The
 * boolean is the same signal in both cases: did this tick actually write?
 * @param db
 * @param worldId
 * @param row
 * @param next
 * @param tick
 * @param nowMs
 */
export async function persist(
  db: DiscoveryDb,
  worldId: string,
  row: ProgressRow,
  next: Recomputed,
  tick: number,
  nowMs: number,
): Promise<boolean> {
  const text = stamp(nowMs,);
  const updated = await db
    .updateTable("location_discovery",)
    .set({ progress: next.progress, last_explored_tick: tick, updated_at: text, },)
    .where("world_id", "=", worldId,)
    .where("location_id", "=", row.location_id,)
    .where("actor_id", "=", row.actor_id,)
    .where("last_explored_tick", "<", tick,)
    .executeTakeFirst();

  if (Number(updated?.numUpdatedRows ?? 0n,) === 1) { return true; }

  // No existing row wrote. Either the row is brand new, or this tick is a
  // replay of one that already advanced it. A new row is written at the
  // recomputed value, which for a first sighting is one tick of gain — the
  // same rule every later tick uses, so there is no special first-tick case.
  const created = await db
    .insertInto("location_discovery",)
    .values({
      world_id: worldId,
      location_id: row.location_id,
      actor_id: row.actor_id,
      progress: next.progress,
      last_explored_tick: tick,
      discovered: 0,
      created_at: text,
      updated_at: text,
    },)
    .onConflict((oc,) => oc.columns(["world_id", "location_id", "actor_id",],).doNothing())
    .executeTakeFirst();

  return Number(created?.numInsertedOrUpdatedRows ?? 0n,) === 1;
}

/**
 * Latch a row as discovered. Guarded so it can only ever latch once.
 *
 * Runs AFTER the event insert. If the process dies in between, the replay
 * re-derives the crossing, loses the event conflict, and latches here — the
 * event is never at risk of being lost, only duplicated, and duplication is
 * what the unique key prevents.
 * @param db
 * @param worldId
 * @param row
 * @param tick
 * @param nowMs
 */
export async function latch(
  db: DiscoveryDb,
  worldId: string,
  row: ProgressRow,
  tick: number,
  nowMs: number,
): Promise<void> {
  await db
    .updateTable("location_discovery",)
    .set({ discovered: 1, discovered_tick: tick, updated_at: stamp(nowMs,), },)
    .where("world_id", "=", worldId,)
    .where("location_id", "=", row.location_id,)
    .where("actor_id", "=", row.actor_id,)
    .where("discovered", "=", 0,)
    .execute();
}
