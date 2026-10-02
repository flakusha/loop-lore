// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/dispatch/gm-beat-dispatch.ts — GM beat dispatch target
//
// The scheduler's second dispatch target: one narrative GM beat per world
// tick. Shaped exactly like `movementDispatch` in
// `src/autonomy/scheduler/index.ts` — the scheduler hands over a resolved
// context, this target owns its own gating and its own governor charge, and
// returns one `{dispatched}` / `{skipped}` line.
//
// GATING ORDER (one charge, one owner):
//   1. autonomy disabled → skip. The scheduler already checked this for
//      movement, but the scheduler itself does not gate extra targets — each
//      target checks, so a GM-only configuration cannot narrate a world the
//      operator switched off.
//   2. governor charge (`per_hour_beat_dispatch`) → skip `gm_budget`.
//   3. `runGmBeat` resolves the world→chat rule and runs the turn.
//
// The charge is taken BEFORE the beat and is the only one. The beat itself
// calls no governor, so a dispatch can never double-spend: a denied beat
// costs one `tryConsume` and zero LLM calls, and an allowed beat costs one of
// each. A beat is an LLM-backed generation, so it bills the hourly
// beat-dispatch limit rather than the movement target's `per_tick_action` —
// the two have different cost profiles (per-tick vs per-hour) and folding
// them together would let a chat's narrative budget be silently consumed by
// NPC wandering, or vice versa.
//
// The scope is the same synthetic `world:<id>` identity `runNpcMovementTick`
// uses (a beat has no actor of its own), and the cap is `perUserCap` for the
// same reason: a `perAgentCap` charge would let a world's beats exceed the
// per-user ceiling.

import { runGmBeat, type GmBeatFactory, } from "../../story/game-master/beat";
import { AutonomyGovernor, } from "../governor";
import type { AutonomyScope, GovernorLimitName, } from "../governor";
import type { AutonomyDispatch, AutonomyDispatchContext, AutonomyDispatchResult, } from "../scheduler";

/** Limit the dispatch gates on. One consume per beat. */
const BEAT_LIMIT: GovernorLimitName = "per_hour_beat_dispatch";

/** Stable target name — appears in the scheduler's telemetry outcome. */
const TARGET_NAME = "gm";

/** Skip reasons this target itself produces. The beat's own misses
 *  (`gm_no_chat` / `gm_chat_ambiguous` / `gm_requires_human`) pass through
 *  unchanged, so one outcome string says which layer declined.
 */
const SKIP_DISABLED = "disabled";
const SKIP_BUDGET = "gm_budget";

/** Scope identity passed to the governor. World-scoped, matching the
 *  movement driver's `tickScope` — a beat has no actor or user of its own.
 * @param worldId
 */
function beatScope(worldId: string,): AutonomyScope {
  return { kind: "user", id: `world:${worldId}`, };
}

/** Options for {@link createGmBeatDispatch}. `createGm` is required: it is
 *  how the composition root supplies the provider-backed GameMasterService,
 *  so this module never imports the provider registry or app config itself.
 */
export interface GmBeatDispatchOptions {
  /** Builds the GM service a beat runs on. */
  createGm: GmBeatFactory;
}

/**
 * Build the GM beat dispatch target.
 *
 * The composition root owns registration — pass the result as
 * `new AutonomyScheduler(db, { dispatch: [createGmBeatDispatch(...)] })`.
 * @param opts
 * @returns {AutonomyDispatch}
 */
export function createGmBeatDispatch(opts: GmBeatDispatchOptions,): AutonomyDispatch {
  return {
    name: TARGET_NAME,
    run: async (ctx: AutonomyDispatchContext,): Promise<AutonomyDispatchResult> => {
      return await runBeat(ctx, opts.createGm,);
    },
  };
}

/**
 * One gated beat. Split out of the closure so the gating reads as a flat
 * sequence rather than being buried in the target object literal.
 * @param ctx the tick's shared context
 * @param createGm provider-wired GM service factory
 * @throws Whatever `runGmBeat` throws — the scheduler records it on the
 *   world's row and continues; one broken target cannot stall the loop.
 * @returns {Promise<AutonomyDispatchResult>}
 */
async function runBeat(
  ctx: AutonomyDispatchContext,
  createGm: GmBeatFactory,
): Promise<AutonomyDispatchResult> {
  if (!ctx.cfg.enabled) { return { skipped: SKIP_DISABLED, }; }

  const governor: AutonomyGovernor = ctx.governor ?? new AutonomyGovernor();
  const gate = await governor.tryConsume(
    ctx.db,
    beatScope(ctx.worldId,),
    BEAT_LIMIT,
    {
      cap: ctx.cfg.perUserCap,
      chatId: ctx.chatId,
      worldId: ctx.worldId,
      nowMs: ctx.nowMs,
    },
  );
  if (!gate.ok) { return { skipped: SKIP_BUDGET, }; }

  const outcome = await runGmBeat(ctx.db, ctx.worldId, createGm,);
  return "skipped" in outcome ? { skipped: outcome.skipped, } : { dispatched: outcome.dispatched, };
}
