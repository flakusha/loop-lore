// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/federation/performance-quota-store.ts — read side of the operator-set
 * budget (migration 068) and the one call that installs it into the in-process
 * counters.
 *
 * Budgets are CONFIGURATION: they are rows, they survive a restart, and the
 * counters that read them do not. `reloadPerformanceQuota` is therefore the
 * whole configuration-reload story — re-run it on every config change and the
 * surviving cells keep their counters.
 *
 * A row that cannot be trusted is DROPPED with a warn, never coerced: a
 * malformed ceiling must not silently become "unlimited". Writes belong to the
 * admin quota routes ticket, so this module only reads and normalises.
 */
import type { Kysely, } from "kysely";
import {
  PEER_BUDGET_MODES,
  type PeerBudgetMode,
  type PeerWorkloadClass,
} from "../db/enums";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import { configurePerformanceQuota, } from "./performance-quota";
import {
  type PerformanceBudget,
  WORKLOAD_CLASS_SET,
} from "./performance-quota-types";

/** One persisted row, as `federation_performance_budgets` stores it. */
type BudgetRow = {
  origin: string;
  workload_class: PeerWorkloadClass;
  budget_mode: PeerBudgetMode;
  max_concurrency: number | null;
  max_queue_depth: number | null;
  requests_per_minute: number | null;
  tokens_per_minute: number | null;
};

/**
 * @param value
 * @returns {number | null}
 */
function positiveOrNull(value: number | null,): number | null {
  return typeof value === "number" && Number.isInteger(value,) && value > 0 ? value : null;
}

/**
 * @param row
 * @returns {PerformanceBudget | null}
 */
function toBudget(row: BudgetRow,): PerformanceBudget | null {
  if (!WORKLOAD_CLASS_SET.has(row.workload_class,)) { return null; }
  if (!PEER_BUDGET_MODES.includes(row.budget_mode,)) { return null; }

  return {
    origin: row.origin,
    workloadClass: row.workload_class,
    mode: row.budget_mode,
    maxConcurrency: positiveOrNull(row.max_concurrency,),
    maxQueueDepth: positiveOrNull(row.max_queue_depth,),
    requestsPerMinute: positiveOrNull(row.requests_per_minute,),
    tokensPerMinute: positiveOrNull(row.tokens_per_minute,),
  };
}

/**
 * Every budget an operator has set, malformed rows dropped with a warn.
 * @param database
 * @returns {Promise<PerformanceBudget[]>}
 */
export async function listPerformanceBudgets(database: Kysely<DB>,): Promise<PerformanceBudget[]> {
  const rows = await database
    .selectFrom("federation_performance_budgets",)
    .selectAll()
    .orderBy("origin",)
    .orderBy("workload_class",)
    .execute();

  const budgets: PerformanceBudget[] = [];
  for (const row of rows) {
    const budget = toBudget(row,);
    if (budget === null) {
      getChildLogger("federation-quota",)?.warn("dropping malformed performance budget row", {
        origin: row.origin,
        workloadClass: row.workload_class,
        budgetMode: row.budget_mode,
      },);

      continue;
    }

    budgets.push(budget,);
  }

  return budgets;
}

/**
 * Load the budgets from the DB and install them in the in-process counters.
 * The single entry point a config reload calls.
 * @param options
 * @returns {Promise<PerformanceBudget[]>}
 */
export async function reloadPerformanceQuota(
  options: { database: Kysely<DB>; enabled: boolean },
): Promise<PerformanceBudget[]> {
  const budgets = await listPerformanceBudgets(options.database,);
  configurePerformanceQuota({ enabled: options.enabled, budgets, },);
  return budgets;
}
