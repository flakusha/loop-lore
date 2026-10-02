// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/cron/dag/store.ts — Durable edge persistence
 *
 * The `task_dependencies` half of the DAG, split from the execution half
 * in ./engine.ts. Keeping the INSERT here means the pass loop never
 * touches Kysely, and the upsert's conflict policy lives in exactly one
 * place.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { FailurePolicy, } from "./types";

/**
 * Persist `taskId` → `dependsOnTaskId`.
 *
 * Re-adding an existing pair updates its policy rather than duplicating
 * the row, so the same edge can be re-declared with a different
 * `on_failure` without a delete-then-insert race.
 *
 * The caller MUST reject a cycle-forming edge before calling: the table
 * has no way to express one, and a cycle is only detectable by walking
 * the graph (see `DagGraph.wouldCycle`).
 *
 * @param db
 * @param taskId the blocked node
 * @param dependsOnTaskId the node it waits for
 * @param onFailure what to do with `taskId` when the prerequisite fails
 * @returns {Promise<void>}
 */
export async function saveDependency(
  db: Kysely<DB>,
  taskId: string,
  dependsOnTaskId: string,
  onFailure: FailurePolicy,
): Promise<void> {
  await db
    .insertInto("task_dependencies",)
    .values({ task_id: taskId, depends_on_task_id: dependsOnTaskId, on_failure: onFailure, },)
    .onConflict((oc,) =>
      oc.columns(["task_id", "depends_on_task_id",],).doUpdateSet({ on_failure: onFailure, },)
    )
    .execute();
}

/**
 * Every stored edge, ordered for a deterministic graph rebuild.
 *
 * ponytail: loads the whole table. Filter by a workflow/run column if
 * edges ever need to be scoped to one run rather than all of them.
 *
 * @param db
 * @returns task id, the node it waits on, and that edge's policy
 */
export async function loadDependencies(
  db: Kysely<DB>,
): Promise<{ taskId: string; dependsOnTaskId: string; onFailure: FailurePolicy; }[]> {
  const rows = await db
    .selectFrom("task_dependencies",)
    .select(["task_id", "depends_on_task_id", "on_failure",],)
    .orderBy("task_id",)
    .orderBy("depends_on_task_id",)
    .execute();
  return rows.map((row,) => ({
    taskId: row.task_id,
    dependsOnTaskId: row.depends_on_task_id,
    onFailure: row.on_failure as FailurePolicy,
  },),);
}
