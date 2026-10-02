// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-discovery/discovery.ts — exploration progress per tick
 *
 * Every NPC standing in a location gains progress there; progress bleeds
 * back out on ticks when the NPC is somewhere else. No LLM call, no
 * `Math.random()`: this is the deterministic tier of
 * `docs/spec/autonomy-determinism.md` (see "RNG discipline" below).
 *
 * THE PROGRESS RULE — recompute, never increment
 * ---------------------------------------------
 * The obvious implementation — `progress = progress + GAIN` — is wrong the
 * moment the process crashes, because the scheduler replays at most one
 * world tick after a crash (`src/autonomy/scheduler/README.md`,
 * Persistence) and an increment applies twice for one tick of real time.
 * So progress is RECOMPUTED from stored state and elapsed ticks:
 *
 *     newProgress = clamp(progress + rate(present, T) * elapsed, 0, 100)
 *     elapsed      = T - last_explored_tick
 *
 * and the write is guarded by `WHERE last_explored_tick < T`. A replayed
 * tick finds `last_explored_tick == T` and matches no rows, so it is a
 * no-op by construction rather than by a flag someone has to remember to
 * set. The gain is therefore applied exactly once per elapsed tick, and a
 * 20-tick gap applies 20 ticks of gain — no drift, because it is computed
 * from the same inputs in the same order on every run.
 *
 * EXACTLY ONCE — the threshold fires once per LOCATION
 * ---------------------------------------------------
 * `discovered` is a per-actor column, so two actors crossing the threshold
 * on the same tick would both latch their own row. The event is NOT emitted
 * from that column: it goes through `emitWorldEvent`, whose dedupe key is
 * scoped to the location, and only an insert that actually landed counts as
 * an event. Two actors crossing together therefore produce two latched
 * rows (true — both charted it) and one event (the location is announced
 * once). The event is written BEFORE the flag so a crash between the two
 * re-runs the insert on replay, loses the conflict, and skips the flag —
 * the flag write is the losing step, never the event.
 *
 * RNG DISCIPLINE — this module draws NOTHING from `ctx.rng`
 * --------------------------------------------------------
 * The shared tick RNG is a stream: position N is only reproducible if every
 * target that ran earlier drew the same number of times. Discovery accrual
 * is a deterministic function of (stored progress, tick index), so there is
 * nothing to randomise — and a draw here would couple discovery to the
 * registration order of every other target on the tick. That is the reason
 * `ctx.rng` is threaded through and unused. The determinism spec calls
 * this out as the correct shape for simulation, and it is why a replayed
 * tick needs no RNG stream position to be restored.
 *
 * CLAIMS — discovery is observational, it does not contest locations
 * -----------------------------------------------------------------
 * `advancePartyTravel` gives one ARRIVAL per location per tick, tracked in
 * `TravelContext.claims`. Discovery reads where an NPC is; it never moves
 * anyone. Claiming here would either block a party's arrival because
 * somebody is surveying the place, or be immediately overwritten by the
 * party's own write. Neither is an exclusion rule the ticket asks for, so
 * discovery stays out of the contention set entirely.
 */
import { discoveredKey, emitWorldEvent, } from "./events";
import { LOCATION_DISCOVERED, type DiscoveryDb, type DiscoveryResult, } from "./types";

/** Progress gained per tick by an NPC standing in the location. */
export const EXPLORE_GAIN = 4;

/** Progress bled per tick the location is NOT being explored. */
export const DECAY_PER_TICK = 0.5;

/** Progress needed to chart a location. Matches epic-world-locations' 0-100. */
export const DISCOVERY_THRESHOLD = 100;

/** Progress row, as this module needs it. */
interface ProgressRow {
  location_id: string;
  actor_id: string;
  progress: number;
  last_explored_tick: number;
  discovered: number;
}

/** An NPC's current whereabouts. */
interface Presence {
  actor_id: string;
  location_id: string;
}

/** What one row's recomputation decided. */
interface Recomputed {
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
 */
function recompute(row: ProgressRow, present: boolean, tick: number,): Recomputed {
  const elapsed = Math.max(1, tick - row.last_explored_tick,);
  const rate = present ? EXPLORE_GAIN - DECAY_PER_TICK : -DECAY_PER_TICK;
  const progress = Math.min(DISCOVERY_THRESHOLD, Math.max(0, row.progress + rate * elapsed,));
  return { progress, fresh: !row.discovered && progress >= DISCOVERY_THRESHOLD, };
}

/** SQLite has no date type; the rest of the schema stores `datetime('now')`. */
function stamp(nowMs: number,): string {
  return new Date(nowMs,).toISOString().replace("T", " ").slice(0, 19,);
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
 */
async function readPresence(db: DiscoveryDb, worldId: string,): Promise<Presence[]> {
  return db
    .selectFrom("npc_states")
    .select(["actor_id", "location_id",])
    .where("world_id", "=", worldId,)
    .where("location_id", "is not", null,)
    .orderBy("actor_id", "asc",)
    .execute();
}

/**
 * Read the world's progress rows, in a total order.
 *
 * Also the `ORDER BY` that makes the write loop reproducible: the recompute
 * of row 2 must not depend on whether row 1 won a conflict.
 */
async function readProgress(db: DiscoveryDb, worldId: string,): Promise<ProgressRow[]> {
  return db
    .selectFrom("location_discovery")
    .select(["location_id", "actor_id", "progress", "last_explored_tick", "discovered",])
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
 */
async function persist(
  db: DiscoveryDb,
  worldId: string,
  row: ProgressRow,
  next: Recomputed,
  tick: number,
  nowMs: number,
): Promise<boolean> {
  const text = stamp(nowMs,);
  const updated = await db
    .updateTable("location_discovery")
    .set({ progress: next.progress, last_explored_tick: tick, updated_at: text, })
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
    .insertInto("location_discovery")
    .values({
      world_id: worldId,
      location_id: row.location_id,
      actor_id: row.actor_id,
      progress: next.progress,
      last_explored_tick: tick,
      discovered: 0,
      created_at: text,
      updated_at: text,
    })
    .onConflict((oc,) => oc.columns(["world_id", "location_id", "actor_id",]).doNothing(),)
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
 */
async function latch(db: DiscoveryDb, worldId: string, row: ProgressRow, tick: number, nowMs: number,): Promise<void> {
  await db
    .updateTable("location_discovery")
    .set({ discovered: 1, discovered_tick: tick, updated_at: stamp(nowMs,), },)
    .where("world_id", "=", worldId,)
    .where("location_id", "=", row.location_id,)
    .where("actor_id", "=", row.actor_id,)
    .where("discovered", "=", 0,)
    .execute();
}

/**
 * Advance every NPC's exploration progress in the world by one tick.
 *
 * @param db widened database handle
 * @param worldId world to simulate
 * @param currentTick the tick being simulated — also the decay clock
 * @param nowMs wall clock, for `updated_at` only; never read for logic
 * @returns how much moved, and how many events landed
 */
export async function runDiscoveryTick(
  db: DiscoveryDb,
  worldId: string,
  currentTick: number,
  nowMs: number,
): Promise<DiscoveryResult> {
  const [presence, rows] = await Promise.all([readPresence(db, worldId,), readProgress(db, worldId,),]);

  // A row exists for every (location, actor) pair the world has ever seen.
  // Actors that moved are kept so their old row decays, and pairs with no row
  // yet get one seeded below. Both sets key on the PAIR, not the location: a
  // row is one actor's progress, so an NPC that walked away must stop accruing
  // even while a companion is still standing there.
  const pair = (locationId: string, actorId: string,): string => `${locationId}\u0000${actorId}`;
  const present = new Set(presence.map((npc,) => pair(npc.location_id, npc.actor_id,),),);
  const keys = new Map<string, ProgressRow>();
  for (const row of rows) { keys.set(pair(row.location_id, row.actor_id,), row); }
  for (const npc of presence) {
    const key = pair(npc.location_id, npc.actor_id,);
    if (!keys.has(key,)) {
      keys.set(key, { location_id: npc.location_id, actor_id: npc.actor_id, progress: 0, last_explored_tick: currentTick - 1, discovered: 0, },);
    }
  }

  let explored = 0;
  let discovered = 0;
  let events = 0;

  for (const key of Array.from(keys.keys()).sort()) {
    const row = keys.get(key,);
    if (!row) { continue; }
    // A charted location stops accruing — there is nothing left to find, and
    // the frozen row is also what keeps a replay from re-deciding it.
    if (row.discovered) { continue; }

    const next = recompute(row, present.has(key,), currentTick,);
    if (!(await persist(db, worldId, row, next, currentTick, nowMs,))) {
      // The tick already advanced this row: a replay. Nothing to do.
      continue;
    }

    explored++;
    if (!next.fresh) { continue; }

    const landed = await emitWorldEvent(db, {
      worldId,
      eventType: LOCATION_DISCOVERED,
      subjectId: row.location_id,
      actorId: row.actor_id,
      tick: currentTick,
      payload: { location_id: row.location_id, actor_id: row.actor_id, progress: next.progress, },
      dedupeKey: discoveredKey(worldId, row.location_id,),
    },);
    if (landed) { events++; }
    discovered++;
    await latch(db, worldId, row, currentTick, nowMs,);
  }

  return { explored, discovered, events, };
}
