// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BDI reflection checkpoint.
 *
 * `applyReflectionCheckpoint(planId, opts)` re-evaluates a plan and emits
 * a `PlanRevision` row if priorities shifted. If priorities are unchanged,
 * no row is written.
 *
 * @module services/agency/bdi-reflection
 */

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db";

export interface ReflectionOpts {
  revision_kind: "priority_shift" | "activity_added" | "activity_removed";
  before: string;
  after: string;
  reason: string;
}

export interface ReflectionResult {
  emitted: boolean;
  revisionId?: string;
}

/**
 * Apply one reflection step. Returns `{ emitted: false }` when no shift
 * occurred; `{ emitted: true, revisionId }` when a row was inserted.
 * @param {Kysely<DB>} db
 * @param {string} planId
 * @param {ReflectionOpts} opts
 * @returns {Promise<ReflectionResult>}
 */
export async function applyReflectionCheckpoint(
  db: Kysely<DB>,
  planId: string,
  opts: ReflectionOpts,
): Promise<ReflectionResult> {
  if (opts.before === opts.after) { return { emitted: false, }; }

  const row = await sql<{ id: string }>`SELECT lower(hex(randomblob(16))) AS id`.execute(db,);
  const id = row.rows[0]!.id;
  await db
    .insertInto("actor_plan_revisions",)
    .values({
      id,
      plan_id: planId,
      revision_kind: opts.revision_kind,
      before_priority: opts.before,
      after_priority: opts.after,
      reason: opts.reason,
      created_at: sql`datetime('now')`,
    },)
    .execute();

  return { emitted: true, revisionId: id, };
}

/** Default reflection cadence: 0 = checkpoint on the nightly visit only
 *  (the pre-cadence behavior). A positive N fires the checkpoint every
 *  N dispatched beat steps for the plan. */
export const DEFAULT_REFLECTION_STEP_INTERVAL = 0;

/**
 * Should a reflection checkpoint fire for a plan that has accumulated
 * `stepCount` steps under cadence `interval`? Only positive intervals
 * gate: 0 means the cadence is disabled and the caller falls back to
 * the once-per-night visit.
 * @param stepCount Steps accumulated since the last checkpoint.
 * @param interval Configured cadence (0 = disabled).
 */
export function shouldReflectAt(stepCount: number, interval: number,): boolean {
  return interval > 0 && stepCount >= interval;
}

/**
 * Increment the reflection step counter of one plan, returning the new
 * value. Called once per dispatched beat step by the BDI dispatch.
 * @param db
 * @param planId
 */
export async function incrementReflectionSteps(db: Kysely<DB>, planId: string,): Promise<number> {
  await db
    .updateTable("actor_daily_plans",)
    .set((eb,) => ({ reflection_step_count: eb("reflection_step_count", "+", 1,), }))
    .where("id", "=", planId,)
    .execute();

  const row = await db
    .selectFrom("actor_daily_plans",)
    .select("reflection_step_count",)
    .where("id", "=", planId,)
    .executeTakeFirst();

  return row?.reflection_step_count ?? 0;
}

/**
 * Reset a plan's reflection step counter after a checkpoint fired.
 * @param db
 * @param planId
 */
export async function resetReflectionSteps(db: Kysely<DB>, planId: string,): Promise<void> {
  await db
    .updateTable("actor_daily_plans",)
    .set({ reflection_step_count: 0, },)
    .where("id", "=", planId,)
    .execute();
}
