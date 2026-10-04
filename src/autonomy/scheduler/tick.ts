// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/scheduler/tick.ts — the per-world tick
 *
 * Everything `AutonomyScheduler` does for ONE world between `started`
 * and `completed`/`error`: resolve cadence, derive that tick's RNG stream,
 * run the dispatch targets, commit the advanced cursor, and record a
 * failure. Split out of ./index.ts so that file is the public surface
 * (tickOnce / stepOnce / pause / resume / stateFor) and this one is the
 * loop it drives.
 *
 * Free functions, not methods: the tick takes exactly the state it reads
 * as a `TickDeps`, so nothing here reaches back into the class.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { toDate, } from "../../utils/date";
import type { AutonomyConfig, } from "../config";
import { resolveAutonomyConfig, } from "../config";
import type { AutonomyGovernor, } from "../governor";
import { deriveTickRng, } from "../rng";
import type { SimulationStore, } from "./store";
import { aggregate, describe, } from "./targets";
import { emitSchedulerEvent, EV_COMPLETED, EV_ERROR, EV_STARTED, } from "./telemetry";
import type {
  AutonomyDispatch,
  AutonomyDispatchContext,
  AutonomyDispatchResult,
  SimulationState,
  WorldScheduleEntry,
  WorldTickOutcome,
  WorldTickResult,
} from "./types";

/** Backoff before retrying a world whose dispatch threw, so a broken
 *  world is not re-selected every pass. ponytail: fixed; per-world
 *  exponential retry only if ops reports hot-looping worlds.
 */
const RETRY_BACKOFF_MS = 5_000;

/** `last_error` column budget; telemetry carries the full text. */
const ERROR_MAX_CHARS = 500;

/** The scheduler-owned state one per-world tick reads. */
export interface TickDeps {
  readonly db: Kysely<DB>;
  readonly store: SimulationStore;
  /** Explicit per-tick RNG override — the test seam. Undefined in
   *  production, where the tick derives the stream from
   *  `AutonomyConfig.seed` instead.
   */
  readonly rngOverride: (() => number) | undefined;
  /** Shared governor handed to every target; targets charge their own
   *  budget, so the scheduler never charges on their behalf.
   */
  readonly governor: AutonomyGovernor | undefined;
  /** Registered targets, `movementDispatch` first. */
  readonly dispatchTargets: AutonomyDispatch[];
}

/** started → dispatch → commit cursor → completed (or error).
 * @param deps the scheduler-owned state this tick reads
 * @param entry the due world and the state it was selected on
 * @param nowMs
 * @returns the world's result plus the cursor it was committed at
 */
export async function tickWorld(deps: TickDeps, entry: WorldScheduleEntry, nowMs: number,): Promise<WorldTickResult> {
  const { worldId, state, } = entry;
  emitSchedulerEvent(deps.db, EV_STARTED, {
    world_id: worldId,
    tick_count: state.tick_count,
    next_tick_at: state.next_tick_at,
  },);

  try {
    const chatId = await deps.store.chatIdFor(worldId,);
    const cfg = await resolveAutonomyConfig(deps.db, { worldId, chatId, },);
    // One stream per world-tick, derived here so every target on
    // this tick draws from the same one (the jitter coin flip in
    // the movement driver and any target's own draws must be
    // correlated, not independent). `state.tick_count` is the
    // index of the tick being computed, not the one just
    // completed: the cursor advance writes `tick_count + 1` AFTER
    // dispatch returns, so the value read here is N for the Nth
    // tick. Using N+1 would make a replay of tick N derive the
    // stream tick N+1 used, and a jitter drop in one tick would
    // shift the next. `seed: null` (every shipped preset) makes
    // deriveTickRng return Math.random — the organic production
    // path, unchanged.
    const rng = deps.rngOverride ?? deriveTickRng({
      seed: cfg.seed,
      worldId,
      tickIndex: state.tick_count,
    },);

    const outcome = await dispatch(deps, worldId, chatId, nowMs, cfg, rng,);
    const nextTickAt = await advance(deps.store, worldId, state, nowMs, cfg.tickIntervalMs,);
    emitSchedulerEvent(deps.db, EV_COMPLETED, {
      world_id: worldId,
      outcome: describe(outcome,),
      next_tick_at: nextTickAt,
      tick_count: state.tick_count + 1,
    },);

    return { worldId, nextTickAt, outcome, };
  } catch (err) {
    return await onWorldError(deps, worldId, state, err, nowMs,);
  }
}

/** Run every registered dispatch target for one world tick. The
 *  scheduler owns no dispatch logic of its own: it builds the shared
 *  context and aggregates what the targets report. Each target owns
 *  its own gating and governor charge — the scheduler never charges
 *  on a target's behalf, so nothing double-spends.
 * @param deps the scheduler-owned state this tick reads
 * @param worldId
 * @param chatId
 * @param nowMs
 * @param cfg resolved autonomy config, handed to every target
 * @param rng the tick's stream, derived once by `tickWorld` and
 *  shared by every target in run order
 * @returns the aggregated tick outcome
 */
async function dispatch(
  deps: TickDeps,
  worldId: string,
  chatId: string,
  nowMs: number,
  cfg: AutonomyConfig,
  rng: () => number,
): Promise<WorldTickOutcome> {
  const ctx: AutonomyDispatchContext = {
    db: deps.db,
    worldId,
    chatId,
    nowMs,
    cfg,
    rng,
    governor: deps.governor,
  };

  const results: AutonomyDispatchResult[] = [];
  for (const target of deps.dispatchTargets) {
    results.push(await target.run(ctx,),);
  }

  return aggregate(results,);
}

/** Commit the advanced cursor. A skipped tick (budget, jitter,
 *  disabled) still advances, so a denied world is rescheduled
 *  rather than dropped or re-selected on every pass.
 * @param store
 * @param worldId
 * @param state
 * @param nowMs
 * @param intervalMs
 * @returns the ISO cursor the world was committed at
 */
async function advance(
  store: SimulationStore,
  worldId: string,
  state: SimulationState,
  nowMs: number,
  intervalMs: number,
): Promise<string> {
  const nextTickAt = toDate(nowMs + Math.max(intervalMs, 1,),).toISOString();
  await store.write(worldId, {
    paused: state.paused,
    next_tick_at: nextTickAt,
    last_run_at: toDate(nowMs,).toISOString(),
    last_error: null,
    tick_count: state.tick_count + 1,
  },);

  return nextTickAt;
}

/** Record the failure, back the world off, emit the error event.
 * @param deps
 * @param worldId
 * @param state
 * @param err
 * @param nowMs
 * @returns the failed result with the backoff cursor
 */
async function onWorldError(
  deps: TickDeps,
  worldId: string,
  state: SimulationState,
  err: unknown,
  nowMs: number,
): Promise<WorldTickResult> {
  const message = err instanceof Error ? err.message : String(err,);
  const nextTickAt = toDate(nowMs + RETRY_BACKOFF_MS,).toISOString();
  try {
    await deps.store.write(worldId, {
      paused: state.paused,
      next_tick_at: nextTickAt,
      last_run_at: toDate(nowMs,).toISOString(),
      last_error: message.slice(0, ERROR_MAX_CHARS,),
      tick_count: state.tick_count, // not incremented: the tick did not complete
    },);
  } catch (writeErr) {
    getLogger()
      .child({ module: "autonomy.scheduler", },)
      .warn("Failed to persist scheduler error state", { worldId, error: String(writeErr,), },);
  }

  emitSchedulerEvent(deps.db, EV_ERROR, { world_id: worldId, error: message, next_tick_at: nextTickAt, },);
  return { worldId, nextTickAt, outcome: { skipped: "error", }, error: message, };
}
