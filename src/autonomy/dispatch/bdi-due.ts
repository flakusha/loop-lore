// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BDI dispatch selection helpers (split from bdi-dispatch.ts for the
 * file-size gate): cadence step aging and the due-actor set.
 *
 * @module autonomy/dispatch/bdi-due
 */

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db";

/**
 * World members due for a plan (re)compute: no plan row for `planDate`,
 * or — when cadence is enabled — an existing plan whose reflection step
 * counter has reached the interval. Id-ordered so the set is identical
 * across restarts.
 * @param db
 * @param worldId
 * @param planDate
 * @param limit
 * @param stepInterval
 */
export async function dueActors(
  db: Kysely<DB>,
  worldId: string,
  planDate: string,
  limit: number,
  stepInterval: number,
): Promise<string[]> {
  const planned = await db
    .selectFrom("actor_daily_plans",)
    .select("actor_id",)
    .where("world_id", "=", worldId,)
    .where("plan_date", "=", planDate,)
    .execute();

  const plannedIds = new Set(planned.map((p,) => p.actor_id),);
  const members = await db
    .selectFrom("world_members",)
    .select("actor_id",)
    .where("world_id", "=", worldId,)
    .orderBy("actor_id", "asc",)
    .execute();

  // Dynamic membership dedupe — the due set is runtime-built per tick.
  const due = new Set<string>();
  for (const m of members) {
    const id = m.actor_id;
    if (plannedIds.has(id,)) { continue; }
    due.add(id,);
  }

  if (stepInterval > 0) {
    const cadenceDue = await db
      .selectFrom("actor_daily_plans",)
      .select("actor_id",)
      .where("world_id", "=", worldId,)
      .where("plan_date", "=", planDate,)
      .where("reflection_step_count", ">=", stepInterval,)
      .execute();

    for (const row of cadenceDue) { due.add(row.actor_id,); }
  }

  return [...due,].sort().slice(0, limit,);
}

/**
 * Age every today-plan in the world by one reflection step. Counters
 * cap at the interval so a plan that keeps missing the budget cannot
 * accumulate an unbounded count.
 * @param db
 * @param worldId
 * @param planDate
 * @param stepInterval
 */
export async function ageReflectionSteps(
  db: Kysely<DB>,
  worldId: string,
  planDate: string,
  stepInterval: number,
): Promise<void> {
  await sql`
    UPDATE actor_daily_plans
    SET reflection_step_count = reflection_step_count + 1
    WHERE world_id = ${worldId}
      AND plan_date = ${planDate}
      AND reflection_step_count < ${stepInterval}
  `.execute(db,);
}
