// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-travel/budget.ts — fractional spend ledger
 *
 * The ticket says "each action costs 0.05 budget unit". The shipped
 * governor cannot enforce that: `AutonomyGovernor.tryConsume` is an
 * INTEGER counter (`window_count` + 1) checked against a cap, so the
 * smallest thing it can express is 1 unit, and 0.05 would mean either
 * 20 consumes per action or a 20x raise of every cap. Rescaling a
 * shared counter whose units belong to a different subsystem is worse
 * than a small ledger of our own, so this file takes option (a): a
 * fractional accumulator per world, compared against a ceiling.
 *
 * The two meters are not redundant and do not both bill the same thing:
 * the governor caps how often a subsystem may RUN (ticks, dispatches),
 * this ledger caps how much world-state change a window may produce.
 * Charging the governor for a batch as well would double-bill a scope
 * the movement target already charges, and would still not express the
 * 0.05 weight — which is why the travel dispatch issues no `tryConsume`
 * call at all. See `src/autonomy/dispatch/travel-dispatch.ts`.
 *
 * Window: tick-based, mirroring the governor's rolling window. The
 * window start is persisted, so a replay of tick N sees the same window
 * a live run saw. Budget is not time-based: at 20 actions per window it
 * is an explicit, reproducible cap, and exhaustion on a long run is the
 * designed behaviour (the AC asks for exactly that), not a leak.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { toDate, } from "../../utils/date";
import { travelDb, } from "./types";

/** Budget units charged per action. The ticket's 0.05. */
export const ACTION_COST = 0.05;

/** Ticks a budget window spans before the accumulator rolls over. */
export const BUDGET_WINDOW_TICKS = 10;

/** Default ceiling in budget units — 20 actions per window. */
export const DEFAULT_CEILING = 1;

/** Money never becomes a float: 0.05 units is exactly 50_000 micro-units, so
 * 20 charges come to 1 exactly rather than 0.9999999999999999. */
const MICRO_UNITS_PER_UNIT = 1_000_000;

function toMicro(units: number,): number {
  return Math.round(units * MICRO_UNITS_PER_UNIT,);
}

function toUnits(micro: number,): number {
  return micro / MICRO_UNITS_PER_UNIT;
}

/** Budget ledger view for one world at one tick. */
export interface BudgetState {
  /** Units spent in the current window. */
  spent: number;
  /** Units the window may spend. */
  ceiling: number;
  /** Units still spendable, floored at 0. */
  remaining: number;
  /** Tick the current window opened on. */
  windowStartTick: number;
}

/**
 * Read the ledger for `worldId`, rolling the window if `tick` has left it.
 *
 * A world with no ledger row reports zero spend, the caller's ceiling, and
 * a window starting at `tick` — the ledger opens on the first charge.
 * @param db database handle
 * @param worldId world whose ledger to read
 * @param tick the tick being simulated
 * @param defaultCeiling units the window may spend while unseeded
 * @returns the ledger state at `tick`
 */
export async function readBudget(
  db: Kysely<DB>,
  worldId: string,
  tick: number,
  defaultCeiling: number,
): Promise<BudgetState> {
  const handle = travelDb(db,);
  const row = await handle
    .selectFrom("world_travel_budget",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .executeTakeFirst();

  if (!row) {
    return { spent: 0, ceiling: defaultCeiling, remaining: defaultCeiling, windowStartTick: tick, };
  }

  const windowStartTick = windowStart(row.window_start_tick, tick,);
  const spent = windowStartTick === row.window_start_tick ? row.spent : 0;
  return {
    spent,
    ceiling: row.ceiling,
    remaining: Math.max(0, row.ceiling - spent,),
    windowStartTick,
  };
}

/**
 * Charge `cost` units against the world's ledger for this tick.
 *
 * Refuses rather than overspends: the caller must treat a false return
 * as "no action happened". Every accepted charge is persisted, so a
 * crash mid-tick cannot mint budget. The UPDATE is a compare-and-set on
 * the columns it read, so a concurrent charge that moved the ledger first
 * loses the CAS and also returns false — a spurious refusal, never an
 * uncharged action.
 * @param db database handle
 * @param worldId world to charge
 * @param tick the tick being simulated
 * @param cost units to charge
 * @param nowMs instant written to `updated_at`
 * @param defaultCeiling units the window may spend while unseeded
 * @returns true when the charge fit inside the ceiling AND was applied
 */
export async function chargeBudget(
  db: Kysely<DB>,
  worldId: string,
  tick: number,
  cost: number,
  nowMs: number,
  defaultCeiling: number,
): Promise<boolean> {
  const handle = travelDb(db,);
  const row = await handle
    .selectFrom("world_travel_budget",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .executeTakeFirst();

  if (!row) {
    if (toMicro(cost,) > toMicro(defaultCeiling,)) { return false; }
    await handle
      .insertInto("world_travel_budget",)
      .values({
        world_id: worldId,
        spent: cost,
        ceiling: defaultCeiling,
        window_start_tick: tick,
        updated_at: toSqlDate(nowMs,),
      },)
      .execute();
    return true;
  }

  const windowStartTick = windowStart(row.window_start_tick, tick,);
  const spentMicro = windowStartTick === row.window_start_tick ? toMicro(row.spent,) : 0;
  const nextMicro = spentMicro + toMicro(cost,);
  if (nextMicro > toMicro(row.ceiling,)) { return false; }

  // Compare-and-set on both columns this read. `spent` and
  // `window_start_tick` are the row's whole mutable state, so a concurrent
  // charge that moved either one leaves this UPDATE matching nothing and the
  // loser returns false. Without it both runners write `nextMicro` computed
  // from the same pre-state, the ledger under-counts by a charge, and the
  // ceiling silently stops binding.
  //
  // The predicates re-bind `row.spent` verbatim, NOT `toUnits(spentMicro,)`.
  // `spent` is REAL and `Math.round(x*1e6)/1e6` is not the identity for a
  // value off the 1e-6 grid — the unseeded insert above stores the raw
  // `cost`. A round-tripped guard would never match and would refuse every
  // later charge. Re-binding the double read out of the column is exact.
  const applied = await handle
    .updateTable("world_travel_budget",)
    .set({ spent: toUnits(nextMicro,), window_start_tick: windowStartTick, updated_at: toSqlDate(nowMs,), },)
    .where("world_id", "=", worldId,)
    .where("window_start_tick", "=", row.window_start_tick,)
    .where("spent", "=", row.spent,)
    .executeTakeFirst();
  return Number(applied?.numUpdatedRows ?? 0,) > 0;
}

/**
 * The tick the current window opened on.
 *
 * The window rolls forward in whole windows, so `window_start_tick` only
 * ever moves by `BUDGET_WINDOW_TICKS` and the boundary a tick observes
 * does not depend on how many ticks were processed before it.
 * @param windowStartTick the persisted window start
 * @param tick the tick being simulated
 * @returns the window start `tick` falls in
 */
function windowStart(windowStartTick: number, tick: number,): number {
  // A replay may rewind; anchoring on `tick` keeps the roll monotone rather
  // than resuming a window the rewind already invalidated.
  if (tick < windowStartTick) { return tick; }
  const elapsed = tick - windowStartTick;
  if (elapsed < BUDGET_WINDOW_TICKS) { return windowStartTick; }
  return windowStartTick + Math.floor(elapsed / BUDGET_WINDOW_TICKS,) * BUDGET_WINDOW_TICKS;
}

/**
 * SQLite has no date type. The rest of the schema stores `datetime('now')`
 * text, so an injected instant is formatted the same way for a byte-equal
 * replay row.
 * @param nowMs epoch milliseconds
 * @returns SQLite datetime text
 */
export function toSqlDate(nowMs: number,): string {
  return toDate(nowMs,).toISOString().replace("T", " ",).replace(/\.\d+Z$/, "",);
}
