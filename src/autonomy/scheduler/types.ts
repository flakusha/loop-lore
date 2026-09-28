// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/scheduler/types.ts — Scheduler shapes
 *
 * Pure types only; the AutonomyScheduler class lives in ./index.ts.
 * Mirrors the `world_simulation_state` table row-by-row so the
 * scheduler never hand-casts a DB row.
 */

import type { Selectable, } from "kysely";
import type { DB, } from "../../db/schema";

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

/** Result of dispatching one due world. Either a short-circuit
 *  reason (the tick-driver's own skip vocabulary, plus `error`
 *  which only the scheduler can produce) or the movement count.
 */
export type WorldTickOutcome = { skipped: TickSkipReason } | { dispatched: number };

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
