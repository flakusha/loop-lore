// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/scheduler/targets.ts — the built-in dispatch target and how results fold
 *
 * What a world tick RUNS, as opposed to when it runs. The scheduler owns
 * the loop (./tick.ts); this file owns the target list and the rule for
 * turning N target results into one outcome. Adding a gameplay subsystem
 * means implementing `AutonomyDispatch` and registering it on the
 * scheduler — nothing here changes.
 *
 * The fold is deliberately not a barrier: a skip never aborts the tick, so
 * a GM beat off-cadence cannot stop NPC movement.
 */

import { runNpcMovementTick, } from "../../rpg/npc-navigation/tick-driver";
import type {
  AutonomyDispatch,
  AutonomyDispatchContext,
  AutonomyDispatchResult,
  WorldTickOutcome,
} from "./types";

/** The built-in dispatch target: NPC movement through the existing
 *  pipeline. Registered first in every scheduler, so adding a target
 *  is additive and never displaces movement.
 */
export const movementDispatch: AutonomyDispatch = {
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
export function aggregate(results: AutonomyDispatchResult[],): WorldTickOutcome {
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
export function describe(outcome: WorldTickOutcome,): string {
  return "skipped" in outcome ? `skipped:${outcome.skipped}` : `dispatched:${outcome.dispatched}`;
}
