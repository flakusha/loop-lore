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
