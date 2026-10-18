// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BDI-lite nightly reflection cycle.
 *
 * Per-actor, once per night, recompute the `DailyPlan` and emit
 * `PlanRevision` rows when reflection shifts priorities. Cost-bounded
 * by the configured budget; deficit returns silently.
 *
 * ponytail: bdi-nightly runs sequential per-actor; parallelise after
 * cost governor supports per-actor budgets.
 *
 * @module services/agency/bdi-nightly
 */

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db";
import { createLogger, getLogger, } from "../../logger";
import { sanitizeDailyPlan, } from "./bdi-plan-shape";
import {
  applyReflectionCheckpoint,
  DEFAULT_REFLECTION_STEP_INTERVAL,
  resetReflectionSteps,
  shouldReflectAt,
} from "./bdi-reflection";
import { newId, } from "./chat-buffer";

// Lazy logger init — module body must not throw if the global logger
// has not been initialized yet (e.g. direct module import in tests).
try {
  getLogger();
} catch {
  createLogger({ level: "error", },);
}

const log = getLogger().child({ module: "agency/bdi-nightly", },);

/** Cost-aware plan generator. Caller injects (default: deterministic stub). */
export type PlanRecomputeFn = (actorId: string, worldId: string | undefined, today: string,) => Promise<{
  summary: string;
  priority: string;
  activities: Array<{ description: string; score: number }>;
}>;

/** Cost governor decision. Returns true if the actor may proceed tonight. */
export type BudgetApproveFn = (actorId: string,) => Promise<boolean>;

export interface NightlyOptions {
  budgetApprove: BudgetApproveFn;
  planRecompute: PlanRecomputeFn;
  /** Stop after this many actors (defensive default: 100). */
  maxActors?: number;
  /** ISO YYYY-MM-DD override (defaults to today UTC). Tests inject to avoid wall-clock skew. */
  today?: string;
  /** Reflection cadence: attempt the checkpoint every N dispatched beat
   *  steps for an existing plan (the dispatch increments the step counter
   *  and selects cadence-due actors). 0 (default) = once-per-night visit
   *  only, matching the pre-cadence behavior. */
  reflectionStepInterval?: number;
}

export interface NightlyResult {
  processed: number;
  skippedBudget: number;
  revisionsEmitted: number;
  /** Actors whose recompute threw or returned a non-plan; the rest of the loop still runs. */
  failed: number;
  /** Per-actor decision telemetry: `bdi:plan_created` on a new plan,
   *  `bdi:priority_shift` when a revision row was emitted. Feeds
   *  `interaction_logs.action_type` stamping via quality-metrics
   *  `recordActionType` when a caller has an interaction log to stamp. */
  decisionEvents: Array<{ actorId: string; actionType: string }>;
}

const DEFAULT_PRIORITY = "normal";

/**
 * Run the nightly cycle. Sequential per-actor; parallelise after the
 * cost governor supports per-actor budgets (ponytail note above).
 * @param db
 * @param actorIds
 * @param opts
 * @returns {Promise<NightlyResult>}
 */
export async function runNightlyReflectionCycle(
  db: Kysely<DB>,
  actorIds: readonly string[],
  opts: NightlyOptions,
): Promise<NightlyResult> {
  const limit = opts.maxActors ?? 100;
  const target = actorIds.slice(0, limit,);
  const today = opts.today ?? todayIso();
  const stepInterval = opts.reflectionStepInterval ?? DEFAULT_REFLECTION_STEP_INTERVAL;
  const summary = {
    processed: 0,
    skippedBudget: 0,
    revisionsEmitted: 0,
    failed: 0,
    decisionEvents: [] as Array<{ actorId: string; actionType: string }>,
  };

  for (const actorId of target) {
    // Fault isolation: one actor's throwing recompute (or a failed DB
    // write) must not abort the remaining actors' nightly plans.
    try {
      const allowed = await opts.budgetApprove(actorId,);
      if (!allowed) {
        summary.skippedBudget += 1;
        continue;
      }

      const prevPlan = await db
        .selectFrom("actor_daily_plans",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .where("plan_date", "=", today,)
        .executeTakeFirst();

      const worldId = await actorWorldId(db, actorId,);
      const next = sanitizeDailyPlan(await opts.planRecompute(actorId, worldId ?? undefined, today,),);

      if (next === null) {
        // Defense-in-depth: the production generator (createPlanRecompute)
        // already clamps its output, but the seam is injectable — never
        // persist a non-plan (garbage priority/summary) verbatim.
        log.warn("bdi-nightly: planRecompute returned a non-plan — skipping actor", {
          actorId,
          planDate: today,
        },);

        summary.failed += 1;
        continue;
      }

      if (!prevPlan) {
        await insertPlan(db, actorId, worldId, today, next,);
        summary.decisionEvents.push({ actorId, actionType: "bdi:plan_created", },);
      } else if (
        shouldReflectAt(prevPlan.reflection_step_count, stepInterval,) ||
        prevPlan.priority !== next.priority
      ) {
        // Cadence-due revisit (positive interval) attempts the checkpoint
        // every N steps — applyReflectionCheckpoint is a no-op while the
        // priorities hold, so no revision row appears without a shift.
        // Interval 0 keeps the legacy shift-only behavior.
        const result = await applyReflectionCheckpoint(db, prevPlan.id, {
          revision_kind: "priority_shift",
          before: prevPlan.priority,
          after: next.priority,
          reason: "nightly reflection",
        },);

        if (result.emitted) {
          summary.revisionsEmitted += 1;
          summary.decisionEvents.push({ actorId, actionType: "bdi:priority_shift", },);
        }

        if (stepInterval > 0) { await resetReflectionSteps(db, prevPlan.id,); }
      }

      summary.processed += 1;
    } catch (error) {
      log.error(
        "bdi-nightly: actor failed — continuing with the remaining actors",
        error instanceof Error ? error : undefined,
        { actorId, planDate: today, },
      );

      summary.failed += 1;
    }
  }

  log.info("bdi-nightly complete", summary,);
  return summary;
}

async function insertPlan(
  db: Kysely<DB>,
  actorId: string,
  worldId: string | null,
  today: string,
  next: { summary: string; priority: string; activities: Array<{ description: string; score: number }> },
): Promise<void> {
  const planId = await newId(db,);
  await db
    .insertInto("actor_daily_plans",)
    .values({
      id: planId,
      actor_id: actorId,
      world_id: worldId ?? null,
      plan_date: today,
      summary: next.summary,
      priority: next.priority ?? DEFAULT_PRIORITY,
      created_at: sql`datetime('now')`,
    },)
    .execute();

  for (const a of next.activities) {
    await db
      .insertInto("actor_planned_activities",)
      .values({
        id: await newId(db,),
        plan_id: planId,
        description: a.description,
        score: a.score,
        completed: 0,
        created_at: sql`datetime('now')`,
      },)
      .execute();
  }
}

/** The actor's world, via the `world_members` link.
 *
 *  An actor may belong to several worlds; `world_id ASC` keeps the choice
 *  deterministic so a restart re-derives the same plan row.
 *
 *  This used to return `actorId` whenever the actor existed, which wrote
 *  the actor's own id into `actor_daily_plans.world_id`.
 * @param db
 * @param actorId
 */
async function actorWorldId(db: Kysely<DB>, actorId: string,): Promise<string | null> {
  const row = await db
    .selectFrom("world_members",)
    .select("world_id",)
    .where("actor_id", "=", actorId,)
    .orderBy("world_id", "asc",)
    .executeTakeFirst();

  return row?.world_id ?? null;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1,).padStart(2, "0",)}-${
    String(d.getUTCDate(),).padStart(2, "0",)
  }`;
}

export { recordChatTurn, } from "./chat-buffer";
