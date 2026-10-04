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
 * per world run the tick in ./tick.ts — resolve cadence from
 * AutonomyConfig, run the registered dispatch targets (the scheduler
 * owns none of their logic), and commit the advanced cursor, the commit
 * point, so a crash replays at most one world. See README.md for
 * ordering, ops and telemetry.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { AutonomyGovernor, } from "../governor";
import { SimulationStore, } from "./store";
import { movementDispatch, } from "./targets";
import { type TickDeps, tickWorld, } from "./tick";
import type {
  AutonomyDispatch,
  SimulationState,
  TickResult,
  WorldScheduleEntry,
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

  /** The state one per-world tick reads; see ./tick.ts.
   * @returns the deps handed to `tickWorld`
   */
  get #tickDeps(): TickDeps {
    return {
      db: this.#db,
      store: this.#store,
      rngOverride: this.#rngOverride,
      governor: this.#governor,
      dispatchTargets: this.#dispatchTargets,
    };
  }

  /** started → dispatch → commit cursor → completed (or error).
   * @param entry
   * @param nowMs
   * @returns the world's result plus the cursor it was committed at
   */
  #tickWorld(entry: WorldScheduleEntry, nowMs: number,): Promise<WorldTickResult> {
    return tickWorld(this.#tickDeps, entry, nowMs,);
  }
}

/** Scheduler options — derived from the class ctor (single source). */
export type AutonomySchedulerOptions = NonNullable<ConstructorParameters<typeof AutonomyScheduler>[1]>;

export type {
  AutonomyDispatch,
  AutonomyDispatchResult,
  AutonomyDispatchContext,
} from "./types";
