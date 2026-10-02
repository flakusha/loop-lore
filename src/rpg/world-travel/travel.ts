// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 245
//
// Cohesive on purpose: the collision rule below has to live next to the walk
// that enforces it, and splitting this file would scatter one AC's required
// documentation across two modules.

/**
 * src/rpg/world-travel/travel.ts — party travel along a route
 *
 * `advancePartyTravel` walks every active party one tick forward along its
 * stored route. No LLM call, no `Math.random()`: the step is entirely the
 * deterministic tier of `docs/spec/autonomy-determinism.md`. A party covers
 * `steps_per_tick` route edges, a fractional speed carries its remainder into
 * `travel_progress` so 0.5 edges/tick still moves, and every write is an
 * `UPDATE ... WHERE id = ?` on a row read in a total order — so the same
 * world + seed + tick index yields the same rows whatever order the scheduler
 * batched the calls in. A DB scan gives parties no inherent order, so
 * `ORDER BY id ASC` is what makes the tick a function of state alone. `id` is
 * a `randomblob` hex string, so the tie-break is arbitrary but FIXED: a party
 * created later with a lower id cannot retroactively flip a past tick.
 *
 * Collision rule — first claimant in tick order wins, losers defer. A location
 * holds one arrival per tick; `ctx.claims` is the set of locations already
 * taken THIS tick. A party arriving into a claimed location stops where it is
 * and sets `blocked_until_tick = tick + 1`, so it re-contests next tick and
 * falls behind rather than stalling forever. Occupancy tracks ARRIVALS only,
 * never "a party is parked here": a resting party does not block a newcomer,
 * which keeps a closed route from locking its own start point. Two parties at
 * the same index of one route always target the same location, so the second
 * defers until the first moves on — the deterministic outcome the AC asks for.
 * Routes that merely SHARE a location resolve by id, and each reaches it later.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils/safe-json";
import { ACTION_COST, chargeBudget, toSqlDate, } from "./budget";
import { type TravelContext, travelDb, type TravelResult, } from "./types";
import { type Walk, walk, } from "./walk";

/** Party status values that stop a party from moving.
 *
 * `resting` belongs here alongside `disbanded`, and its absence was a real
 * bug: `parkParty` below stamps `PARKED_AT` ("resting"), so a party parked
 * for a deleted location passed this filter, failed the same `alive` check
 * on every later tick, and re-parked itself forever — one write per tick per
 * dead party, growing without bound. A settled party is unaffected: it is
 * already skipped by the `route_index >= route.length - 1` guard below. */
const PARKED = ["disbanded", "resting",];

/** Status given to a party whose route can no longer be walked. */
const PARKED_AT = "resting";

/**
 * Park a party whose route can never be walked again.
 *
 * `route` is free-text JSON with no foreign key, so it can outlive the
 * locations it names. Without this the write would raise a foreign-key error
 * out of the tick AFTER the charge landed — billing for a move that never
 * happened, and failing every other party's tick along with it.
 * @param db database handle
 * @param partyId the party to park
 * @param currentTick the tick to stamp
 * @param stamp `updated_at` text for the write
 */
async function parkParty(db: Kysely<DB>, partyId: string, currentTick: number, stamp: string,): Promise<void> {
  await travelDb(db,)
    .updateTable("travel_parties",)
    .set({ status: PARKED_AT, current_tick: currentTick, updated_at: stamp, },)
    .where("id", "=", partyId,)
    .execute();
}

/**
 * Persist one party's step, guarded by the replay latch.
 *
 * The write carries `WHERE current_tick < :tick` — the column migration 036
 * nominates as the party's replay guard, the same idea one column over from
 * discovery's `last_explored_tick`. A tick the scheduler replays after a
 * crash matches no row, so a replayed party neither moves a second time nor
 * is billed a second time. Charging and claiming both hang off the write, so
 * each is a consequence of the move rather than a bill for a move a replay
 * would undo.
 * @param db database handle
 * @param partyId the party to advance
 * @param step the walk to persist
 * @param currentTick the tick being simulated
 * @param stamp `updated_at` text for the write
 * @returns true when the row actually advanced; false on a replay
 */
async function commitStep(
  db: Kysely<DB>,
  partyId: string,
  step: Walk,
  currentTick: number,
  stamp: string,
): Promise<boolean> {
  const moved = await travelDb(db,)
    .updateTable("travel_parties",)
    .set(
      step.edges === 0
        ? { travel_progress: step.progress, current_tick: currentTick, status: "traveling", updated_at: stamp, }
        : {
          route_index: step.routeIndex,
          travel_progress: step.progress,
          current_location_id: step.locationId,
          current_tick: currentTick,
          status: step.settled ? "resting" : "traveling",
          updated_at: stamp,
        },
    )
    .where("id", "=", partyId,)
    .where("current_tick", "<", currentTick,)
    .executeTakeFirst();
  return Number(moved?.numUpdatedRows ?? 0,) === 1;
}

/**
 * Parse a stored route, tolerating the corrupt-row case.
 * @param raw the `route` column
 * @returns ordered location ids, empty when the column is unusable
 */
function parseRoute(raw: string,): string[] {
  // A route that will not parse is a data bug, not a tick bug: the party is
  // skipped rather than failing the whole world tick. `jsonParseOr` swallows the
  // throw, so the corrupt row and the non-array row take one path.
  const parsed = jsonParseOr<unknown>(raw, [],);
  if (!Array.isArray(parsed,)) { return []; }
  return parsed.filter((id,): id is string => typeof id === "string");
}

/**
 * Advance every party in `worldId` by one tick.
 *
 * Every state change is charged `ACTION_COST` against the world budget. A
 * refused charge means the party does not move and the loop stops, so the
 * tick never applies more than it can fund.
 * @param db database handle
 * @param worldId world whose parties advance
 * @param currentTick the tick being simulated
 * @param ctx per-tick context: `nowMs`, `rng`, `ceiling`, shared `claims`
 * @returns the actions applied, in application order
 */
export async function advancePartyTravel(
  db: Kysely<DB>,
  worldId: string,
  currentTick: number,
  ctx: TravelContext,
): Promise<TravelResult> {
  const result: TravelResult = { actions: [], deferred: 0, budgetExhausted: false, };
  const claims = ctx.claims ?? new Set<string>();
  const stamp = toSqlDate(ctx.nowMs,);
  const parties = await travelDb(db,)
    .selectFrom("travel_parties",)
    .select(["id", "route", "route_index", "steps_per_tick", "travel_progress", "blocked_until_tick",],)
    .where("world_id", "=", worldId,)
    .where("status", "not in", PARKED,)
    .where("blocked_until_tick", "<=", currentTick,)
    .orderBy("id", "asc",)
    .execute();

  // Every location the world still has, for O(1) membership below. One query
  // per tick beats one per party, and this is the only place a route id is
  // ever checked against the world.
  const alive = new Set(
    (await db.selectFrom("locations",).select(["id", "world_id",],).execute())
      .map((loc,) => loc.world_id + ":" + loc.id),
  );

  for (const party of parties) {
    const route = parseRoute(party.route,);
    if (route.length < 2) { continue; }
    if (party.route_index >= route.length - 1) { continue; }
    if (!Number.isFinite(party.steps_per_tick,) || party.steps_per_tick <= 0) { continue; }

    // The next hop must be a location the world still has; a route that
    // names a deleted one is parked for good (see parkParty).
    const next = route[party.route_index + 1];
    if (!next) { continue; }
    if (!alive.has(worldId + ":" + next,)) {
      await parkParty(db, party.id, currentTick, stamp,);
      continue;
    }

    // Local claims so a party refused by the budget leaves no phantom
    // occupancy behind for the next party in the loop.
    const mine = new Set(claims,);
    const step = walk(party, route, mine,);
    if (step.edges === 0 && step.progress === party.travel_progress) { continue; }

    if (step.edges === 0 && party.travel_progress + party.steps_per_tick >= 1) {
      // A whole edge of distance was available and its destination is
      // taken: lose this tick and re-contest on the next one. The latch
      // guards this write too, or a replay would defer the party again and
      // push `blocked_until_tick` one tick further out every replay.
      const deferred = await travelDb(db,)
        .updateTable("travel_parties",)
        .set({ blocked_until_tick: currentTick + 1, current_tick: currentTick, updated_at: stamp, },)
        .where("id", "=", party.id,)
        .where("current_tick", "<", currentTick,)
        .executeTakeFirst();
      // A replay matched no row, so it defers nobody — counting it would
      // make the tick report more deferrals than the world actually has.
      if (Number(deferred?.numUpdatedRows ?? 0,) === 1) { result.deferred += 1; }
      continue;
    }

    // A slow party carries less than a whole edge. That carry is real
    // distance covered, so it is persisted and charged — a speed of 0.5
    // that never accumulated would never move at all.
    if (!(await commitStep(db, party.id, step, currentTick, stamp,))) {
      // The write is the commit point: a party this tick cannot advance is a
      // replay, and a replayed party must not re-claim the locations it
      // already holds — nor re-bill the world for them.
      continue;
    }

    for (const locationId of mine) { claims.add(locationId,); }
    if (!(await chargeBudget(db, worldId, currentTick, ACTION_COST, ctx.nowMs, ctx.ceiling,))) {
      result.budgetExhausted = true;
      break;
    }
    result.actions.push({ kind: "party_step", subjectId: party.id, tick: currentTick, cost: ACTION_COST, },);
  }

  return result;
}
