// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors:

// src/autonomy/governor/ledger.ts — per-actor spend over the current window
//
// No new table: `autonomy_budget` rows already carry per-actor spend —
// one row per (scope_kind, scope_id, limit_name) with a rolling-window
// counter. This folds an actor's rows into their current windows (the
// same arithmetic the governor enforces) and sums them. Rows past
// their window read as 0, so spend is always "over window", never
// lifetime. Denied consumes (budget or kill switch) never mutate rows,
// so the ledger only ever reflects allowed work.

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { LIMIT_CATALOG, } from "./index";
import type { GovernorLimitName, } from "./types";
import { effectiveWindow, } from "./window";

/** Per-actor spend folded into the windows in force now. */
export interface ActorSpend {
  /** The actor the spend belongs to. */
  actorId: string;
  /** Sum of in-window consumes across every limit row. */
  total: number;
  /** In-window consumes per limit. */
  counts: Record<GovernorLimitName, number>;
}

/**
 * Sum an actor's governed consumes over the current window.
 * @param db
 * @param opts
 * @param opts.actorId the actor to total
 * @param opts.nowMs override `now` for tests
 * @returns spend totals; actors with no rows read as zero
 */
export async function spendForActor(
  db: Kysely<DB>,
  opts: { actorId: string; nowMs?: number },
): Promise<ActorSpend> {
  const nowMs = opts.nowMs ?? Date.now();
  const counts: Record<GovernorLimitName, number> = {
    per_tick_action: 0,
    per_minute_generation: 0,
    per_hour_beat_dispatch: 0,
  };

  let total = 0;

  const rows = await db
    .selectFrom("autonomy_budget",)
    .select(["limit_name", "window_start_at", "window_count", "updated_at",],)
    .where("scope_kind", "=", "actor",)
    .where("scope_id", "=", opts.actorId,)
    .execute();

  for (const row of rows) {
    const limit = LIMIT_CATALOG[row.limit_name as GovernorLimitName];
    if (!limit) { continue; }
    const count = effectiveWindow(
      {
        scope_kind: "actor",
        scope_id: opts.actorId,
        limit_name: row.limit_name as GovernorLimitName,
        window_start_at: row.window_start_at,
        window_count: row.window_count,
        updated_at: row.updated_at,
      },
      limit,
      nowMs,
    ).count;

    counts[row.limit_name as GovernorLimitName] += count;
    total += count;
  }

  return { actorId: opts.actorId, total, counts, };
}
