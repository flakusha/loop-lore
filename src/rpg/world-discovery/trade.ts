// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-discovery/trade.ts — `trade:route` per tick
 *
 * Reads the travel domain (`travel_parties`, `npc_migrations`, both from
 * `036_world_travel_simulation`) and leaves a `trade:route` event for every
 * convoy that is in motion. No LLM call, no `Math.random()`: pure read plus
 * an idempotent insert, the deterministic tier of
 * `docs/spec/autonomy-determinism.md`. Nothing here draws from the tick RNG
 * — the event carries observed state, not a sampled one.
 *
 * ORDERING vs the TRAVEL TARGET — this reads, it does not advance
 * ---------------------------------------------------------------
 * `advancePartyTravel` owns party movement and writes `status` /
 * `route_index` on the way through. This target is registered after it, so
 * the status it reads is the one travel just wrote — a convoy that arrived
 * this tick has already been counted as moving. That ordering is a property
 * of the composition root (`src/cron/jobs.ts`, owned by the orchestrator),
 * not of this file.
 * A party that reached the end of its route is `resting` and correctly
 * fires nothing.
 *
 * "ROUTE AND ECONOMY"
 * --------------------
 * The AC says to consult each party's route AND economy. Route is
 * `travel_parties.route` + `route_index` — the real thing, and the reason a
 * party is a convoy at all. There is no per-party economy table anywhere in
 * the schema: `trade_history` is keyed by ACTOR pair (buyer/seller), not by
 * party, so no join can answer "this party's economy". Rather than invent a
 * ledger that the epic that owns prices does not have, the world's realised
 * trade volume is read and attached to the event, which is the honest part
 * of "consult the economy": the event says which trade routes are live and
 * how much trade the world has actually done.
 *
 * # ponytail: world-wide trade volume, not per-party. A party earns its own
 * ledger when epic-economy-trading introduces one; until then the count is a
 * world figure repeated on every event, and a consumer that needs per-party
 * economics gets a follow-up migration, not a second table in this ticket.
 *
 * CLAIMS — trade is observational too
 * -----------------------------------
 * `advancePartyTravel` gives one arrival per location per tick through
 * `TravelContext.claims`. A convoy event is a report ABOUT a movement, not a
 * movement, so trade does not claim anything: claiming would stop a real
 * party from arriving somewhere merely because a log line was written about
 * the one before it.
 *
 * In-transit NPCs are included. A migration in the `in_transit` state is a
 * caravan of one — it is the same "goods are moving between locations" fact
 * at a different granularity, and the AC asks for convoys in motion, not
 * only multi-body parties.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { travelDb, } from "../../rpg/world-travel";
import { jsonParseOr, } from "../../utils/safe-json";
import { emitWorldEvent, tradeRouteKey, } from "./events";
import { discoveryDb, TRADE_ROUTE, type TradeResult, } from "./types";

/** Movement statuses that mean "this party is on the road right now". */
const MOVING = ["traveling",];

/** Migration status for a relocation that has left and not yet landed. */
const IN_TRANSIT = "in_transit";

/** A convoy as this module sees it, after the two sources are merged. */
interface Convoy {
  /** Party id, or `actor:<migration row id>` — the event's subject. */
  id: string;
  /** The actor behind the convoy, when there is one. A party is not an
   * actor; a migration is. `null` for parties, and NEVER a migration row
   * id — `world_event_log.actor_id` references `actors.id`. */
  actorId: string | null;
  /** `party` or `migration` — the event payload's discriminator. */
  source: string;
  /** Where it came from, when known. */
  from: string | null;
  /** Where it is headed. */
  to: string | null;
  /** Route edge cursor, for parties. */
  routeIndex: number | null;
}

/**
 * Read the world's parties that are moving, in a total order.
 *
 * `ORDER BY id ASC` for the same reason `travel.ts` uses it: a DB scan has
 * no inherent order, and a restore that hands rows back differently must
 * still produce the same events. `id` is unique, so the order is total.
 */
async function readMovingParties(db: Kysely<DB>, worldId: string,): Promise<Convoy[]> {
  const rows = await travelDb(db,)
    .selectFrom("travel_parties",)
    .select(["id", "route", "route_index", "current_location_id", "status",],)
    .where("world_id", "=", worldId,)
    .where("status", "in", MOVING,)
    .orderBy("id", "asc",)
    .execute();

  return rows.map((row,) => ({
    id: row.id,
    actorId: null,
    source: "party",
    from: row.current_location_id,
    to: edgeAhead(row.route, row.route_index,),
    routeIndex: row.route_index,
  }));
}

/**
 * Read the world's in-transit migrations, in a total order.
 *
 * `actor_id` is unique per migration row in practice but not by constraint,
 * so `id` breaks the tie and the order stays total.
 */
async function readMigrations(db: Kysely<DB>, worldId: string,): Promise<Convoy[]> {
  const rows = await travelDb(db,)
    .selectFrom("npc_migrations",)
    .select(["id", "actor_id", "origin_location_id", "destination_location_id",],)
    .where("world_id", "=", worldId,)
    .where("status", "=", IN_TRANSIT,)
    .orderBy("id", "asc",)
    .execute();

  return rows.map((row,) => ({
    // Namespaced so a party id can never collide with a migration's subject.
    id: `actor:${row.id}`,
    actorId: row.actor_id,
    source: "migration",
    from: row.origin_location_id,
    to: row.destination_location_id,
    routeIndex: null,
  }));
}

/**
 * The next location id on a stored route.
 *
 * `route` is free-text JSON with no foreign key, exactly as `travel.ts`'s
 * `parseRoute` treats it: a row that will not parse is a data bug, and a
 * convoy whose head of route is unreadable still reports its position — it
 * just reports no destination rather than failing the whole world tick.
 */
function edgeAhead(raw: string, routeIndex: number,): string | null {
  const parsed: unknown = jsonParseOr(raw, null,);
  if (!Array.isArray(parsed,)) { return null; }
  const route = parsed.filter((id,): id is string => typeof id === "string");
  return route[routeIndex + 1] ?? null;
}

/**
 * How many trades this world has actually completed.
 *
 * The economy leg of "consult route and economy" — see the header. One
 * aggregate query, no per-party grouping, because there is nothing to group
 * by: `trade_history` is keyed by actor pair.
 */
async function tradeVolume(db: Kysely<DB>, worldId: string,): Promise<number> {
  const row = await db
    .selectFrom("trade_history",)
    .select((eb,) => eb.fn.countAll<string>().as("total",))
    .where("world_id", "=", worldId,)
    .executeTakeFirst();
  return Number(row?.total ?? 0,);
}

/**
 * Fire a `trade:route` event for every convoy in motion in the world.
 *
 * @param db widened database handle
 * @param worldId world to simulate
 * @param currentTick the tick being simulated — part of the dedupe key
 * @returns how many convoys were in motion, and how many events landed
 */
export async function runTradeTick(db: Kysely<DB>, worldId: string, currentTick: number,): Promise<TradeResult> {
  const parties = await readMovingParties(db, worldId,);
  const migrations = await readMigrations(db, worldId,);
  const trades = await tradeVolume(db, worldId,);

  // Sort the merged list by subject id so the INSERT order is total too —
  // the merge of two ordered queries is not otherwise ordered, and a log
  // whose append order varies between runs is not the same log.
  const byId = (a: Convoy, b: Convoy,): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const convoys = [...parties, ...migrations,].sort(byId,);

  // The log lives in this module's tables, the convoys in the travel
  // module's. Each is widened by its own domain helper, so neither module
  // re-declares the other's rows.
  const log = discoveryDb(db,);
  let events = 0;
  for (const convoy of convoys) {
    const landed = await emitWorldEvent(log, {
      worldId,
      eventType: TRADE_ROUTE,
      subjectId: convoy.id,
      actorId: convoy.actorId,
      tick: currentTick,
      payload: {
        source: convoy.source,
        from: convoy.from,
        to: convoy.to,
        route_index: convoy.routeIndex,
        trades_recorded: trades,
      },
      dedupeKey: tradeRouteKey(worldId, currentTick, convoy.id,),
    },);
    if (landed) { events++; }
  }

  return { convoys: convoys.length, events, };
}
