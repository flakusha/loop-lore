// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/scheduler/types.ts — Scheduler shapes
 *
 * Pure types only; the AutonomyScheduler class lives in ./index.ts.
 * Mirrors the `world_simulation_state` table row-by-row so the
 * scheduler never hand-casts a DB row.
 */

import type { Kysely, Selectable, } from "kysely";
import type { DB, } from "../../db/schema";
import type { AutonomyConfig, } from "../config";
import type { AutonomyGovernor, } from "../governor";

/** One world's simulation cursor, exactly as read back from the DB.
 *  `Selectable` unwraps Kysely's `Generated<T>` markers so the
 *  scheduler can read `paused` / `tick_count` as plain values.
 */
export type SimulationState = Selectable<DB["world_simulation_state"]>;

/** A due world selected for this tick, with the state it was
 *  selected on. `worldId` is lifted so the hot loop does not reach
 *  into the row for every log line.
 */
export interface WorldScheduleEntry {
  worldId: string;
  state: SimulationState;
}

/** Why a world was not dispatched this tick. `skipped` mirrors the
 *  tick-driver's own short-circuit vocabulary; `error` is the one
 *  outcome the driver does not produce.
 */
export type TickSkipReason =
  | "paused"
  | "disabled"
  | "jitter"
  | "budget"
  | "error";

/** Result of dispatching one due world. Either a short-circuit reason
 *  or the work dispatched this tick. The reason is open-ended by
 *  design: `TickSkipReason` is the vocabulary the scheduler and the
 *  tick driver use, and a dispatch target names its own short-circuits
 *  (`gm_off_cadence`, `bdi_no_goal`). Pinning a union here would mean
 *  editing this file per subsystem — the coupling the dispatch seam
 *  exists to remove.
 */
export type WorldTickOutcome = { skipped: TickSkipReason | (string & {}) } | { dispatched: number };

/** Result of a single world tick. `nextTickAt` is the cursor the
 *  scheduler persisted, so callers can assert cadence without a
 *  second read.
 */
export interface WorldTickResult {
  worldId: string;
  nextTickAt: string;
  outcome: WorldTickOutcome;
  error?: string;
}

/** Result of one full `tickOnce` pass over the due set. */
export interface TickResult {
  nowMs: number;
  /** Worlds due at `nowMs`, in dispatch order. */
  dueWorldIds: string[];
  /** One entry per due world, in the same order as `dueWorldIds`. */
  worlds: WorldTickResult[];
  /** Due worlds whose dispatch threw. */
  errors: number;
}

/** Everything one dispatch target needs for a single world tick. The
 *  scheduler resolves `cfg` once per tick and hands the same context to
 *  every target, so no target re-resolves cadence or re-plans the RNG.
 */
export interface AutonomyDispatchContext {
  db: Kysely<DB>;
  worldId: string;
  chatId: string;
  nowMs: number;
  /** Resolved autonomy config for this world (cadence, caps, seed). */
  cfg: AutonomyConfig;
  /** The scheduler's RNG for this tick, shared by every target in order. */
  rng: () => number;
  /** Shared governor. Targets charge their own budget — the scheduler
   *  never charges on a target's behalf, so nothing double-spends.
   */
  governor?: AutonomyGovernor;
}

/** One dispatch target the scheduler runs per world tick. Adding a
 *  subsystem is implementing this, not editing the tick loop.
 */
export interface AutonomyDispatch {
  /** Stable name used in telemetry/outcome strings. */
  name: string;
  /** @throws Whatever the target throws. The scheduler catches per-world
   *  and records the failure on that world's row — one broken target
   *  cannot stall the loop.
   */
  run(ctx: AutonomyDispatchContext,): Promise<AutonomyDispatchResult>;
}

/** What a dispatch reports back. `skipped` explains a short-circuit;
 *  `dispatched` is the work it did this tick.
 */
export type AutonomyDispatchResult =
  | { skipped: string }
  | { dispatched: number };

/**
 * The tick index every dispatch target on this tick must read.
 *
 * Both the travel and discovery-trade dispatches index their per-tick work
 * off this row; if they ever disagreed about which tick they were on, a
 * target would write against the wrong tick's world. They therefore read it
 * through one function. The unseeded-world default is left to the caller —
 * the two dispatches genuinely differ on it.
 * @param ctx the scheduler's per-tick context
 * @returns `world_simulation_state.tick_count`, or undefined when unseeded
 */
export async function readTickIndex(ctx: AutonomyDispatchContext,): Promise<number | undefined> {
  const state = await ctx.db
    .selectFrom("world_simulation_state",)
    .select("tick_count",)
    .where("world_id", "=", ctx.worldId,)
    .executeTakeFirst();

  return state?.tick_count;
}
