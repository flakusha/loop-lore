// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/dispatch/bdi-dispatch.ts — BDI nightly reflection target
 *
 * Runs `runNightlyReflectionCycle` for one world, governor-gated and
 * cadence-gated. Two short-circuits matter:
 *
 *  - **Cadence.** The cycle is nightly; the scheduler tick is not. An
 *    actor already carrying a plan for today is dropped before any LLM
 *    spend, so a per-minute tick cannot replan the same NPC sixty times.
 *  - **Budget.** One `per_hour_beat_dispatch` charge per dispatch, billed
 *    to the world scope. The cycle's `budgetApprove` below is a PEEK, not
 *    a second charge: the dispatch already paid, so charging again per
 *    actor would spend hourly budget N times for one night's work.
 *    Deny returns `{skipped:"bdi_budget"}` — never throws, never half-runs.
 *
 * @module autonomy/dispatch/bdi-dispatch
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { runNightlyReflectionCycle, } from "../../services/agency/bdi-nightly";
import type { PlanRecomputeFn, } from "../../services/agency/bdi-nightly";
import { createPlanRecompute, } from "../../services/agency/bdi-plan-recompute";
import { toDate, } from "../../utils/date";
import { AutonomyGovernor, } from "../governor";
import type { AutonomyScope, GovernorLimitName, } from "../governor";
import type { AutonomyDispatch, AutonomyDispatchContext, AutonomyDispatchResult, } from "../scheduler";

/** Stable name — appears verbatim in the scheduler's outcome telemetry. */
export const BDI_DISPATCH_NAME = "bdi";

/** LLM-backed work: the hourly beat bucket, not the per-tick one. */
const BEAT_LIMIT: GovernorLimitName = "per_hour_beat_dispatch";

/** Mirror of the nightly cycle's own defensive actor cap. */
const DEFAULT_MAX_ACTORS = 100;

/** Skip reasons this target reports. `WorldTickOutcome.skipped` is an
 *  open string, so these are the vocabulary, not a closed union. */
export const BDI_SKIP = {
  /** The world has no members at all. */
  NoActors: "bdi_no_actors",
  /** Every member already holds a plan for today. */
  OffCadence: "bdi_off_cadence",
  /** The governor denied the dispatch. */
  Budget: "bdi_budget",
} as const;

export interface CreateBdiDispatchOptions {
  db: Kysely<DB>;
  /** Plan decision function. Defaults to the `callLlm`-backed one. */
  planRecompute?: PlanRecomputeFn;
  /** Shared governor. Defaults to a fresh instance. */
  governor?: AutonomyGovernor;
  /** Per-cycle actor cap. Defaults to 100. */
  maxActors?: number;
  /** ISO YYYY-MM-DD override; defaults to UTC today. Tests pin it. */
  today?: string;
}

/**
 * Build the BDI reflection dispatch target.
 *
 * The composition root owns registration — this only makes the target
 * constructible, so nothing here reaches into the scheduler or cron.
 * @param opts
 * @returns an `AutonomyDispatch` named `bdi`
 */
export function createBdiDispatch(opts: CreateBdiDispatchOptions,): AutonomyDispatch {
  const { db, governor = new AutonomyGovernor(), maxActors, today, } = opts;
  const planRecompute = opts.planRecompute ?? createPlanRecompute({ db, },);
  return {
    name: BDI_DISPATCH_NAME,
    run: (ctx: AutonomyDispatchContext,): Promise<AutonomyDispatchResult> =>
      runBdiDispatch(ctx, { governor, planRecompute, maxActors, today, },),
  };
}

interface RunArgs {
  governor: AutonomyGovernor;
  planRecompute: PlanRecomputeFn;
  maxActors: number | undefined;
  today: string | undefined;
}

async function runBdiDispatch(
  ctx: AutonomyDispatchContext,
  args: RunArgs,
): Promise<AutonomyDispatchResult> {
  const { db, worldId, nowMs, cfg, } = ctx;
  const planDate = args.today ?? isoDate(nowMs,);
  const limit = args.maxActors ?? DEFAULT_MAX_ACTORS;
  const actors = await dueActors(db, worldId, planDate, limit,);
  if (actors.length === 0) {
    // Nobody is due. A world with no members at all and a world whose
    // members are all planned today are different operational stories,
    // so they report different reasons.
    return { skipped: await hasMembers(db, worldId,) ? BDI_SKIP.OffCadence : BDI_SKIP.NoActors, };
  }

  const gate = await args.governor.tryConsume(db, worldScope(worldId,), BEAT_LIMIT, {
    cap: cfg.perUserCap,
    chatId: ctx.chatId,
    worldId,
    nowMs,
  },);
  if (!gate.ok) { return { skipped: BDI_SKIP.Budget, }; }

  const result = await runNightlyReflectionCycle(db, actors, {
    // The dispatch charged `per_hour_beat_dispatch` above; this only peeks
    // at the per-actor cap. One charge per dispatch, never two.
    budgetApprove: (actorId,) =>
      args.governor
        .peek(db, { kind: "actor", id: actorId, }, BEAT_LIMIT, {
          cap: cfg.perAgentCap,
          chatId: ctx.chatId,
          worldId,
          nowMs,
        },)
        .then((w,) => w.remaining === null || w.remaining > 0),
    planRecompute: args.planRecompute,
    maxActors: limit,
    today: planDate,
  },);
  return { dispatched: result.processed, };
}

/** World members with no plan row for `planDate`, id-ordered so the set
 *  is identical across restarts. */
async function dueActors(
  db: Kysely<DB>,
  worldId: string,
  planDate: string,
  limit: number,
): Promise<string[]> {
  const planned = await db
    .selectFrom("actor_daily_plans",)
    .select("actor_id",)
    .where("plan_date", "=", planDate,)
    .execute();
  const plannedIds = new Set(planned.map((p,) => p.actor_id),);
  const members = await db
    .selectFrom("world_members",)
    .select("actor_id",)
    .where("world_id", "=", worldId,)
    .orderBy("actor_id", "asc",)
    .execute();
  return members.map((m,) => m.actor_id).filter((id,) => !plannedIds.has(id,)).slice(0, limit,);
}

/** Does this world have any members at all? */
async function hasMembers(db: Kysely<DB>, worldId: string,): Promise<boolean> {
  const row = await db
    .selectFrom("world_members",)
    .select("actor_id",)
    .where("world_id", "=", worldId,)
    .limit(1,)
    .executeTakeFirst();
  return row !== undefined;
}

/** The dispatch has no actor identity of its own, so the budget is
 *  billed to a synthetic world scope — same shape as the tick-driver's. */
function worldScope(worldId: string,): AutonomyScope {
  return { kind: "user", id: `world:${worldId}`, };
}

function isoDate(nowMs: number,): string {
  const d = toDate(nowMs,);
  const month = String(d.getUTCMonth() + 1,).padStart(2, "0",);
  const day = String(d.getUTCDate(),).padStart(2, "0",);
  return `${d.getUTCFullYear()}-${month}-${day}`;
}
