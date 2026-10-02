// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/dispatch/discovery-trade-dispatch.ts — the `discovery` tick target
 *
 * Runs exploration accrual and `trade:route` detection for the world being
 * ticked. Both steps are pure simulation — see `src/rpg/world-discovery/`
 * for the replay argument and the claims decision — so this file is a thin
 * adapter: read the tick index, widen the handle, run both steps, aggregate.
 *
 * Tick index: `AutonomyDispatchContext` carries no tick number, so the target
 * reads `world_simulation_state.tick_count` — the index of the tick BEING
 * computed (`AutonomyScheduler` increments it only after dispatch returns).
 * The same index `travel-dispatch.ts` reads, which matters: the tick IS the
 * decay clock, so both targets have to agree on which tick they are.
 *
 * NO GOVERNOR CHARGE — this is deliberate, not an omission
 * -----------------------------------------------------------
 * Every other rate-limited target meters an LLM call. This one makes none:
 * the governor's limits (`per_tick_action`, `per_minute_generation`,
 * `per_hour_beat_dispatch`) are all spend counters for GENERATION, and a
 * simulation step that writes a row to SQLite does not generate a token.
 * Charging `per_tick_action` here would meter ticks as if they were calls —
 * it would spend a world its autonomy budget on arithmetic, and it would
 * report a `budget` skip for a world that was throttled by nothing. Skipping
 * the charge is the same choice `travel-dispatch.ts` documents, arrived at
 * from the same premise: the governor caps how often autonomy SPENDS, and
 * this target spends nothing. (The one genuinely unbounded thing a world can
 * do here — churn `location_discovery` rows every tick — is bounded by the
 * world's NPC count, not by a budget.)
 *
 * Ordering: this target reads `travel_parties.status`, so it belongs AFTER
 * the `travel` target in the dispatch list — otherwise a convoy that arrived
 * on this tick is reported one tick late. The composition root owns the
 * list; this only states the requirement.
 */
import { discoveryDb, runDiscoveryTick, runTradeTick, } from "../../rpg/world-discovery";
import type { AutonomyDispatch, AutonomyDispatchContext, AutonomyDispatchResult, } from "../scheduler/types";

/** Options for {@link createDiscoveryTradeDispatch}. */
export interface DiscoveryTradeDispatchOptions {
  /** Telemetry/outcome name. Defaults to `discovery`. */
  name?: string;
}

/** Skip reasons this target reports, mirroring the other targets' vocabulary. */
export const DISCOVERY_SKIP = {
  /** Nothing to explore and no convoy on the road. */
  Idle: "no_discovery",
  /** The scheduler has never seeded this world. */
  Unseeded: "world_unseeded",
} as const;

/**
 * Build the `discovery` dispatch target.
 *
 * The returned target holds no module state, so one instance is safe to share
 * across worlds: every per-tick value lives in the context or the database.
 * @param opts optional telemetry name
 * @returns a target that advances exploration and logs convoy movement
 */
export function createDiscoveryTradeDispatch(opts: DiscoveryTradeDispatchOptions = {},): AutonomyDispatch {
  const name = opts.name ?? "discovery";

  return {
    name,
    async run(ctx: AutonomyDispatchContext,): Promise<AutonomyDispatchResult> {
      const tick = await currentTickIndex(ctx,);
      if (tick === null) { return { skipped: DISCOVERY_SKIP.Unseeded, }; }

      // Each step widens the handle for its own domain — discovery for the
      // log and progress tables, trade for the travel tables it reads.
      const discovery = await runDiscoveryTick(discoveryDb(ctx.db,), ctx.worldId, tick, ctx.nowMs,);
      const trade = await runTradeTick(ctx.db, ctx.worldId, tick,);

      // Events are the observable work: progress advanced on a charted row is
      // a no-op the reader cannot see. Trade is included so a world whose only
      // movement is a convoy still reports as having dispatched.
      const dispatched = discovery.events + trade.events + discovery.explored;
      if (dispatched > 0) { return { dispatched, }; }
      return { skipped: DISCOVERY_SKIP.Idle, };
    },
  };
}

/**
 * The index of the tick being dispatched.
 * @param ctx the scheduler's per-tick context
 * @returns `world_simulation_state.tick_count`, or null when the world is unseeded
 */
async function currentTickIndex(ctx: AutonomyDispatchContext,): Promise<number | null> {
  const state = await ctx.db
    .selectFrom("world_simulation_state",)
    .select("tick_count",)
    .where("world_id", "=", ctx.worldId,)
    .executeTakeFirst();
  return state?.tick_count ?? null;
}
