// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-travel/migration.ts — NPC relocation on the tick timeline
 *
 * A migration row is a schedule, not a move: `depart_tick`/`arrive_tick`
 * bracket one hop, and the NPC's actual location changes only when that
 * hop completes. `migrateNpc` drives the three transitions — depart, wait,
 * arrive — and writes `npc_states.location_id` on arrival, so migration is
 * a real world fact rather than a row nobody reads.
 *
 * Determinism: rows are read `ORDER BY id ASC`, so the tick is a function of
 * state alone. No `Math.random()`, no LLM call, `ctx.nowMs` is written to
 * `updated_at` so a replay produces byte-identical rows.
 *
 * Arrival collision: an NPC arriving into a location already claimed THIS
 * tick (by a party or an earlier NPC) waits — it stays `in_transit` and
 * retries next tick. `ctx.claims` is the same set `advancePartyTravel`
 * writes, so the two subsystems contend for a location by id and the
 * winner is the same on every run. A migration whose destination is null
 * (the location was deleted) is completed silently rather than retried
 * forever: there is nothing left to arrive at.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { ACTION_COST, chargeBudget, toSqlDate, } from "./budget";
import { travelDb, type TravelContext, type TravelResult, } from "./types";

/** A hop that shuttles back and forth. */
const CONTINUOUS = "continuous";

/** Migration row as this module needs it. */
interface MigrationRow {
  id: string;
  actor_id: string;
  origin_location_id: string | null;
  destination_location_id: string | null;
  depart_tick: number;
  arrive_tick: number;
  cadence: string;
  status: string;
}

/**
 * Advance every NPC migration in `worldId` by one tick.
 *
 * Transitions, all charged `ACTION_COST` against the world budget:
 *   - `planned` + `depart_tick <= tick`  → `in_transit` (depart)
 *   - `in_transit` + `arrive_tick <= tick` → `arrived` + `npc_states` move
 * A refused charge stops the tick, so it never applies more than it funds.
 * @param db database handle
 * @param worldId world whose migrations advance
 * @param currentTick the tick being simulated
 * @param ctx per-tick context: `nowMs`, `rng`, `ceiling`, shared `claims`
 * @returns the actions applied, in application order
 */
export async function migrateNpc(
  db: Kysely<DB>,
  worldId: string,
  currentTick: number,
  ctx: TravelContext,
): Promise<TravelResult> {
  const result: TravelResult = { actions: [], deferred: 0, budgetExhausted: false, };
  const claims = ctx.claims ?? new Set<string>();
  const stamp = toSqlDate(ctx.nowMs,);
  const handle = travelDb(db);
  const rows = await handle
    .selectFrom("npc_migrations",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("status", "!=", "arrived",)
    .orderBy("id", "asc",)
    .execute();

  for (const row of rows) {
    const kind = row.status === "planned" && currentTick >= row.depart_tick ? "npc_depart"
      : row.status === "in_transit" && currentTick >= row.arrive_tick ? "npc_arrive"
      : null;
    if (!kind) continue;

    if (kind === "npc_arrive") {
      const destination = row.destination_location_id;
      if (destination && claims.has(destination,)) {
        result.deferred += 1;
        continue;
      }
    } else if (!row.destination_location_id) {
      // Nothing to travel toward: close the hop out rather than retry
      // a schedule whose destination was deleted.
      await handle
        .updateTable("npc_migrations",)
        .set({ status: "arrived", updated_at: stamp, },)
        .where("id", "=", row.id,)
        .execute();
      continue;
    }

    const charged = await chargeBudget(db, worldId, currentTick, ACTION_COST, ctx.nowMs, ctx.ceiling,);
    if (!charged) {
      result.budgetExhausted = true;
      break;
    }

    if (kind === "npc_depart") {
      await handle
        .updateTable("npc_migrations",)
        .set({ status: "in_transit", last_depart_tick: currentTick, updated_at: stamp, },)
        .where("id", "=", row.id,)
        .execute();
    } else {
      const destination = row.destination_location_id;
      if (destination) {
        claims.add(destination,);
        await db
          .updateTable("npc_states",)
          .set({ location_id: destination, },)
          .where("actor_id", "=", row.actor_id,)
          .where("world_id", "=", worldId,)
          .execute();
      }
      await handle
        .updateTable("npc_migrations",)
        .set({ ...reschedule(row, currentTick, destination, stamp,), },)
        .where("id", "=", row.id,)
        .execute();
    }

    result.actions.push({ kind, subjectId: row.actor_id, tick: currentTick, cost: ACTION_COST, },);
  }

  return result;
}

/**
 * The status of a completed hop, and the next one when the cadence repeats.
 *
 * A continuous migration flips origin and destination so the NPC shuttles
 * back over the same span, keeping the original hop length.
 * @param row the migration as read this tick
 * @param currentTick the tick the hop completed on
 * @param arrivedAt the location the NPC ended on, if any
 * @param stamp `updated_at` text for the write
 * @returns the columns to persist on the migration row
 */
function reschedule(
  row: MigrationRow,
  currentTick: number,
  arrivedAt: string | null,
  stamp: string,
): { status: string; origin_location_id: string | null; destination_location_id: string | null; depart_tick: number; arrive_tick: number; updated_at: string } {
  if (row.cadence !== CONTINUOUS) {
    return {
      status: "arrived",
      origin_location_id: row.origin_location_id,
      destination_location_id: row.destination_location_id,
      depart_tick: row.depart_tick,
      arrive_tick: row.arrive_tick,
      updated_at: stamp,
    };
  }
  const span = Math.max(1, row.arrive_tick - row.last_depart_tick,);
  return {
    status: "planned",
    origin_location_id: arrivedAt,
    destination_location_id: row.origin_location_id,
    depart_tick: currentTick,
    arrive_tick: currentTick + span,
    updated_at: stamp,
  };
}
