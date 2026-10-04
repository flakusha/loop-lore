// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-discovery/discovery.ts — exploration progress per tick
 *
 * Every NPC standing in a location gains progress there; progress bleeds
 * back out on ticks when the NPC is somewhere else. No LLM call, no
 * `Math.random()`: this is the deterministic tier of
 * `docs/spec/autonomy-determinism.md`.
 *
 * This file is the tick loop — read the world, walk the (location, actor)
 * pairs, advance each row, announce the ones that just crossed. The row
 * itself (the recompute rule, the idempotent write, the latch) is
 * ./progress.ts; the per-location event log is ./events.ts.
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
 * registration order of every other target on the tick. That is why a
 * replayed tick needs no RNG stream position to be restored.
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
import { latch, persist, type ProgressRow, readPresence, readProgress, recompute, } from "./progress";
import { type DiscoveryDb, type DiscoveryResult, LOCATION_DISCOVERED, } from "./types";
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
  // Sequential, not Promise.all: the two reads are independent but cheap, and
  // Promise.all would leave one rejection unobserved if both failed. Awaiting in
  // order surfaces the first failure to the caller rather than stranding it.
  const presence = await readPresence(db, worldId,);
  const rows = await readProgress(db, worldId,);

  // A row exists for every (location, actor) pair the world has ever seen.
  // Actors that moved are kept so their old row decays, and pairs with no row
  // yet get one seeded below. Both sets key on the PAIR, not the location: a
  // row is one actor's progress, so an NPC that walked away must stop accruing
  // even while a companion is still standing there.
  const pair = (locationId: string, actorId: string,): string => `${locationId}\u0000${actorId}`;
  const present = new Set(presence.map((npc,) => pair(npc.location_id, npc.actor_id,)),);
  const keys = new Map<string, ProgressRow>();
  for (const row of rows) { keys.set(pair(row.location_id, row.actor_id,), row,); }
  for (const npc of presence) {
    const key = pair(npc.location_id, npc.actor_id,);
    if (!keys.has(key,)) {
      keys.set(key, {
        location_id: npc.location_id,
        actor_id: npc.actor_id,
        progress: 0,
        last_explored_tick: currentTick - 1,
        discovered: 0,
      },);
    }
  }

  let explored = 0;
  let discovered = 0;
  let events = 0;

  for (const key of Array.from(keys.keys(),).sort()) {
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
