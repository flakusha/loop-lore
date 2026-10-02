// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/scheduler/index.ts — AutonomyScheduler
 *
 * Pure module: no singleton, no setInterval, no cron. The caller owns
 * an instance and decides WHEN a tick happens; real-time, accelerated
 * and manual sources all reduce to repeated `tickOnce(nowMs)`.
 *
 * One pass: select due worlds (predicate + ordering in store.ts), then
 * per world resolve cadence from AutonomyConfig, run the registered
 * dispatch targets (the scheduler owns none of their logic), and
 * commit the advanced cursor — the commit point, so a crash replays at
 * most one world. See README.md for ordering, ops and telemetry.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { runNpcMovementTick, } from "../../rpg/npc-navigation/tick-driver";
import { toDate, } from "../../utils/date";
import type { AutonomyConfig, } from "../config";
import { resolveAutonomyConfig, } from "../config";
import type { AutonomyGovernor, } from "../governor";
import { deriveTickRng, } from "../rng";
import { SimulationStore, } from "./store";
import { emitSchedulerEvent, EV_COMPLETED, EV_ERROR, EV_STARTED, } from "./telemetry";
import type {
  AutonomyDispatch,
  AutonomyDispatchContext,
  AutonomyDispatchResult,
  SimulationState,
  TickResult,
  WorldScheduleEntry,
  WorldTickOutcome,
  WorldTickResult,
} from "./types";

export type {
  SimulationState,
  TickResult,
  TickSkipReason,
  WorldScheduleEntry,
  WorldTickOutcome,
  WorldTickResult,
} from "./types";

export { SimulationStore, } from "./store";

/** Backoff before retrying a world whose dispatch threw, so a broken
 *  world is not re-selected every pass. ponytail: fixed; per-world
 *  exponential retry only if ops reports hot-looping worlds.
 */
const RETRY_BACKOFF_MS = 5_000;

/** `last_error` column budget; telemetry carries the full text. */
const ERROR_MAX_CHARS = 500;

/** The built-in dispatch target: NPC movement through the existing
 *  pipeline. Registered first in every scheduler, so adding a target
 *  is additive and never displaces movement.
 */
const movementDispatch: AutonomyDispatch = {
  name: "movement",
  run: async (ctx: AutonomyDispatchContext,): Promise<AutonomyDispatchResult> => {
    const out = await runNpcMovementTick(ctx.db, ctx.worldId, {
      chatId: ctx.chatId,
      nowMs: ctx.nowMs,
      rng: ctx.rng,
      governor: ctx.governor,
      paused: false,
    },);
    if ("skipped" in out) { return { skipped: out.skipped, }; }
    return { dispatched: out.results.length, };
  },
};

/** Fold per-target results into one tick outcome. A skip never aborts
 *  the tick — a GM beat off-cadence must not stop NPC movement — so
 *  dispatched work is summed and a tick that dispatched anything at
 *  all reports `dispatched`, even when other targets skipped. Only an
 *  all-skip tick reports a reason: the first in registration order.
 * @param results one result per dispatch target, in run order
 * @returns the tick's outcome
 * @throws If no target produced a result. Unreachable in practice:
 *  the constructor always registers `movementDispatch`, which always
 *  returns one. Reported rather than faked so a future caller that
 *  runs an empty list fails loudly instead of inventing a reason.
 */
function aggregate(results: AutonomyDispatchResult[],): WorldTickOutcome {
  let dispatched = 0;
  let ran = false;
  let firstSkip: string | undefined;
  for (const result of results) {
    if ("skipped" in result) {
      firstSkip ??= result.skipped;
      continue;
    }
    ran = true;
    dispatched += result.dispatched;
  }
  if (ran) { return { dispatched, }; }
  if (firstSkip !== undefined) { return { skipped: firstSkip, }; }
  throw new Error("aggregate: no dispatch target produced a result",);
}
/** Flatten an outcome to a stable telemetry/log token.
 * @param outcome
 * @returns `skipped:<why>` or `dispatched:<n>`
 */
function describe(outcome: WorldTickOutcome,): string {
  return "skipped" in outcome ? `skipped:${outcome.skipped}` : `dispatched:${outcome.dispatched}`;
}

/**
 * AutonomyScheduler — one instance per process/owner. Drives the
 * world tick loop for the autonomy subsystem.
 */
export class AutonomyScheduler {
  readonly #db: Kysely<DB>;
  readonly #store: SimulationStore;
  /** Explicit per-tick RNG override — the test seam. Undefined in
   *  production, where the tick path derives the stream from
   *  `AutonomyConfig.seed` instead (see #tickWorld).
   */
  readonly #rngOverride: (() => number) | undefined;
  readonly #governor: AutonomyGovernor | undefined;
  readonly #dispatchTargets: AutonomyDispatch[];

  constructor(db: Kysely<DB>, opts: {
    /** Shared governor instance. Omitted → each dispatch target builds one. */
    governor?: AutonomyGovernor;
    /** Overrides the per-tick derived RNG for every world and tick.
     *  Test seam: production derives the stream from
     *  `AutonomyConfig.seed` + tick index, so the injected generator
     *  takes precedence over the seed and is the only way to pin
     *  draws without seeding the world. Omitted → derive per tick.
     */
    rng?: () => number;
    /** Extra dispatch targets, appended after the built-in movement
     *  target — movement always runs, so a new subsystem can never
     *  silently stop NPCs moving.
     */
    dispatch?: AutonomyDispatch[];
  } = {},) {
    this.#db = db;
    this.#store = new SimulationStore(db,);
    this.#rngOverride = opts.rng;
    this.#governor = opts.governor;
    this.#dispatchTargets = [movementDispatch, ...(opts.dispatch ?? []),];
  }

  /**
   * Run one full tick pass over the due set. A per-world dispatch
   * failure never throws here: it is recorded on that world's row,
   * counted in `TickResult.errors`, and the pass continues — one
   * broken world cannot stall the loop.
   * @param nowMs tick instant. Inject for deterministic tests.
   * @returns per-tick summary.
   */
  async tickOnce(nowMs: number = Date.now(),): Promise<TickResult> {
    const due = await this.#store.dueWorlds(nowMs,);
    const worlds: WorldTickResult[] = [];
    for (const entry of due) {
      worlds.push(await this.#tickWorld(entry, nowMs,),);
    }
    return {
      nowMs,
      dueWorldIds: due.map((e,) => e.worldId),
      worlds,
      errors: worlds.filter((w,) => "skipped" in w.outcome && w.outcome.skipped === "error").length,
    };
  }

  /**
   * Force one tick for a world, ignoring `paused` and the cursor —
   * the human-in-the-loop step control. The pause survives the step.
   * @param worldId
   * @param nowMs
   */
  async stepOnce(worldId: string, nowMs: number = Date.now(),): Promise<WorldTickResult> {
    return this.#tickWorld({ worldId, state: await this.#store.load(worldId,), }, nowMs,);
  }

  /** Admin pause. Persisted, so it survives a restart.
   * @param worldId
   * @returns the persisted state after the pause
   */
  async pause(worldId: string,): Promise<SimulationState> {
    return this.#store.setPaused(worldId, 1,);
  }

  /** Admin resume. The world becomes due again at the cursor it
   *  already carried — an overdue `next_tick_at` means the very
   *  next tickOnce picks it up.
   * @param worldId
   */
  async resume(worldId: string,): Promise<SimulationState> {
    return this.#store.setPaused(worldId, 0,);
  }

  /** Persisted cursor for a world (synthesized when it has never
   *  ticked — the same value tickOnce would select it on).
   * @param worldId
   * @returns the persisted state
   */
  async stateFor(worldId: string,): Promise<SimulationState> {
    return this.#store.load(worldId,);
  }

  // ── internals ──────────────────────────────────────────────

  /** started → dispatch → commit cursor → completed (or error).
   * @param entry
   * @param nowMs
   * @returns the world's result plus the cursor it was committed at
   */
  async #tickWorld(entry: WorldScheduleEntry, nowMs: number,): Promise<WorldTickResult> {
    const { worldId, state, } = entry;
    emitSchedulerEvent(this.#db, EV_STARTED, {
      world_id: worldId,
      tick_count: state.tick_count,
      next_tick_at: state.next_tick_at,
    },);

    try {
      const chatId = await this.#store.chatIdFor(worldId,);
      const cfg = await resolveAutonomyConfig(this.#db, { worldId, chatId, },);
      // One stream per world-tick, derived here so every target on
      // this tick draws from the same one (the jitter coin flip in
      // the movement driver and any target's own draws must be
      // correlated, not independent). `state.tick_count` is the
      // index of the tick being computed, not the one just
      // completed: #advance writes `tick_count + 1` AFTER dispatch
      // returns, so the value read here is N for the Nth tick. Using
      // N+1 would make a replay of tick N derive the stream tick N+1
      // used, and a jitter drop in one tick would shift the next.
      // `seed: null` (every shipped preset) makes deriveTickRng
      // return Math.random — the organic production path, unchanged.
      const rng = this.#rngOverride ?? deriveTickRng({
        seed: cfg.seed,
        worldId,
        tickIndex: state.tick_count,
      },);
      const outcome = await this.#dispatch(worldId, chatId, nowMs, cfg, rng,);
      const nextTickAt = await this.#advance(worldId, state, nowMs, cfg.tickIntervalMs,);
      emitSchedulerEvent(this.#db, EV_COMPLETED, {
        world_id: worldId,
        outcome: describe(outcome,),
        next_tick_at: nextTickAt,
        tick_count: state.tick_count + 1,
      },);
      return { worldId, nextTickAt, outcome, };
    } catch (err) {
      return await this.#onWorldError(worldId, state, err, nowMs,);
    }
  }

  /** Run every registered dispatch target for one world tick. The
   *  scheduler owns no dispatch logic of its own: it builds the shared
   *  context and aggregates what the targets report. Each target owns
   *  its own gating and governor charge — the scheduler never charges
   *  on a target's behalf, so nothing double-spends.
   * @param worldId
   * @param chatId
   * @param nowMs
   * @param cfg resolved autonomy config, handed to every target
   * @param rng the tick's stream, derived once by #tickWorld and
   *  shared by every target in run order
   * @returns the aggregated tick outcome
   */
  async #dispatch(
    worldId: string,
    chatId: string,
    nowMs: number,
    cfg: AutonomyConfig,
    rng: () => number,
  ): Promise<WorldTickOutcome> {
    const ctx: AutonomyDispatchContext = {
      db: this.#db,
      worldId,
      chatId,
      nowMs,
      cfg,
      rng,
      governor: this.#governor,
    };
    const results: AutonomyDispatchResult[] = [];
    for (const target of this.#dispatchTargets) {
      results.push(await target.run(ctx,),);
    }
    return aggregate(results,);
  }

  /** Commit the advanced cursor. A skipped tick (budget, jitter,
   *  disabled) still advances, so a denied world is rescheduled
   *  rather than dropped or re-selected on every pass.
   * @param worldId
   * @param state
   * @param nowMs
   * @param intervalMs
   * @returns the ISO cursor the world was committed at
   */
  async #advance(
    worldId: string,
    state: SimulationState,
    nowMs: number,
    intervalMs: number,
  ): Promise<string> {
    const nextTickAt = toDate(nowMs + Math.max(intervalMs, 1,),).toISOString();
    await this.#store.write(worldId, {
      paused: state.paused,
      next_tick_at: nextTickAt,
      last_run_at: toDate(nowMs,).toISOString(),
      last_error: null,
      tick_count: state.tick_count + 1,
    },);
    return nextTickAt;
  }

  /** Record the failure, back the world off, emit the error event.
   * @param worldId
   * @param state
   * @param err
   * @param nowMs
   * @returns the failed result with the backoff cursor
   */
  async #onWorldError(
    worldId: string,
    state: SimulationState,
    err: unknown,
    nowMs: number,
  ): Promise<WorldTickResult> {
    const message = err instanceof Error ? err.message : String(err,);
    const nextTickAt = toDate(nowMs + RETRY_BACKOFF_MS,).toISOString();
    try {
      await this.#store.write(worldId, {
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
    emitSchedulerEvent(this.#db, EV_ERROR, { world_id: worldId, error: message, next_tick_at: nextTickAt, },);
    return { worldId, nextTickAt, outcome: { skipped: "error", }, error: message, };
  }
}

/** Scheduler options — derived from the class ctor (single source). */
export type AutonomySchedulerOptions = NonNullable<ConstructorParameters<typeof AutonomyScheduler>[1]>;

  AutonomyDispatch,

  AutonomyDispatchResult,

  AutonomyDispatchContext,
