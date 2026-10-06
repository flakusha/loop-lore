// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/dispatch/travel-dispatch.ts — the `travel` tick target
 *
 * Runs party travel and NPC migration for the world being ticked. The
 * scheduler hands every target the same `AutonomyDispatchContext`, so
 * this one is a thin, stateless adapter: read the tick index, share the
 * RNG and the arrival-claim set between the two steps, aggregate.
 *
 * Tick index: `AutonomyDispatchContext` carries no tick number, so the
 * target reads `world_simulation_state.tick_count` — the index of the tick
 * BEING computed (`AutonomyScheduler` increments it only after dispatch
 * returns). That is the same index the scheduler passes to `deriveTickRng`,
 * so travel and any other target drawing `ctx.rng` stay on one stream.
 *
 * No governor charge. Option (a) of the budget requirement was taken (a
 * fractional ledger in `src/rpg/world-travel/budget.ts`), because
 * `tryConsume` is an integer counter with a cap and cannot express a 0.05
 * weight at all. Charging `per_tick_action` per batch would meter TICKS,
 * not cost, and would double-bill a scope the movement target already
 * charges; the ledger below gates the work instead. The two meters are
 * complementary: the governor caps how often autonomy runs, the ledger
 * caps how much world-state change one window may produce.
 *
 * `claims` is one `Set` shared by both steps for the duration of the tick,
 * which is what makes a party and an NPC contending for the same location
 * resolve by id rather than by whichever subsystem ran first. The step
 * order is fixed (travel, then migration), so the outcome is a function of
 * ids alone.
 */
import { advancePartyTravel, DEFAULT_CEILING, migrateNpc, type TravelContext, } from "../../rpg/world-travel";
import { readTickIndex, } from "../scheduler/types";
import type { AutonomyDispatch, AutonomyDispatchContext, AutonomyDispatchResult, } from "../scheduler/types";

/** Options for {@link createTravelDispatch}. */
export interface TravelDispatchOptions {
  /** Telemetry/outcome name. Defaults to `travel`. */
  name?: string;
  /** Budget units a world's ledger may spend per window. Defaults to
   * {@link DEFAULT_CEILING} (20 actions). */
  ceiling?: number;
}

/**
 * Build the `travel` dispatch target.
 *
 * Pure module state is kept out: the returned target is safe to share
 * across worlds, because every per-tick value lives in the context or in
 * the database.
 * @param opts optional name and budget ceiling
 * @returns a target that advances party travel and NPC migration
 */
export function createTravelDispatch(opts: TravelDispatchOptions = {},): AutonomyDispatch {
  const name = opts.name ?? "travel";
  const ceiling = opts.ceiling ?? DEFAULT_CEILING;

  return {
    name,
    async run(ctx: AutonomyDispatchContext,): Promise<AutonomyDispatchResult> {
      const tick = await currentTickIndex(ctx,);
      const travelCtx: TravelContext = {
        nowMs: ctx.nowMs,
        rng: ctx.rng,
        ceiling,
        claims: new Set<string>(),
      };

      const travel = await advancePartyTravel(ctx.db, ctx.worldId, tick, travelCtx,);
      const migration = await migrateNpc(ctx.db, ctx.worldId, tick, travelCtx,);
      const dispatched = travel.actions.length + migration.actions.length;
      if (dispatched > 0) { return { dispatched, }; }
      if (travel.budgetExhausted || migration.budgetExhausted) { return { skipped: "travel_budget", }; }
      return { skipped: "no_travel", };
    },
  };
}

/**
 * The index of the tick being dispatched.
 * @param ctx the scheduler's per-tick context
 * @returns `world_simulation_state.tick_count`, or 0 for an unseeded world
 */
async function currentTickIndex(ctx: AutonomyDispatchContext,): Promise<number> {
  return (await readTickIndex(ctx,)) ?? 0;
}
