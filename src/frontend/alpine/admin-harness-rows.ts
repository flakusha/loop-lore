// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Display shaping for the Harness tab's LIST views: wire rows -> pre-formatted
 * row models (stat cards, runs table, per-model rollup, tooling gaps).
 *
 * Kept apart from `admin-harness.ts` so the component holds only state +
 * fetch, and so the formatters are unit-testable without an Alpine object.
 * The template binds these values directly — no formatting lives in markup.
 *
 * The detail panel's view model lives in ./admin-harness-detail-view and the
 * shared cell formatters in ./admin-harness-format; both are re-exported here
 * so existing `from "./admin-harness-rows"` imports keep working.
 */
import type { Static, } from "@sinclair/typebox";
import { formatDuration, formatRunTs, formatUsd, textOrDash, } from "./admin-harness-format";
import {
  type HarnessDiscoveredModel,
  HarnessRunDetailSchema,
  HarnessRunSummarySchema,
  HarnessStatsSchema,
} from "./admin-harness-schema";
import { t, } from "./i18n";

// Formatters and the detail-view builder live in sibling modules; re-exported
// here so existing `from "./admin-harness-rows"` imports keep working.
/** One run row as `GET /api/v1/harness/runs` serves it. */
export type HarnessRunSummary = Static<typeof HarnessRunSummarySchema>;
/** One run as `GET /api/v1/harness/runs/:runId` serves it. */
export type HarnessRunDetail = Static<typeof HarnessRunDetailSchema>;
/** The `GET /api/v1/harness/stats` body. */
export type HarnessStats = Static<typeof HarnessStatsSchema>;

/** A stat card: already-translated label + pre-formatted value. */
export interface HarnessStatCard {
  key: string;
  label: string;
  value: string;
}

/** A runs-table row: every cell pre-formatted, so the template just binds. */
export interface HarnessRunRow {
  runId: string;
  ts: string;
  task: string;
  taskType: string;
  model: string;
  result: string;
  failed: boolean;
  duration: string;
  cost: string;
  tokens: string;
  tools: number;
  branch: string;
  gitSha: string;
}

/** One per-model rollup row, pre-formatted. */
export interface HarnessModelRow {
  model: string;
  runs: number;
  failures: number;
  avg: string;
  cost: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * One discovered-model row, pre-formatted (the template formats nothing).
 *
 * Unknown values carry an explicit dash: a blank cell would read like a
 * false claim ("this model has no tools" instead of "we do not know").
 */
export interface HarnessDiscoveredModelRow {
  profile: string;
  model: string;
  /** `harness` (verified by the harness) or `static` (configured fallback). */
  source: string;
  /** Why a static fallback was used; dash when the entry is harness-reported. */
  reason: string;
  contextWindow: string;
  maxOutput: string;
  /** The KNOWN capabilities, joined; dash when none is known. */
  capabilities: string;
  /** The advertised modalities, comma-joined; dash when none is known. */
  modalities: string;
}

/** One tooling-gap row. */
export interface HarnessGapRow {
  toolingGap: string;
  count: number;
}
/**
 * Build the `/runs` query string from the current filter values. Empty filters
 * are omitted rather than sent blank, so the server applies no filter.
 * @param taskType - Selected task type, or "" for all
 * @param result - Selected result, or "" for all
 * @param limit - Page size to request
 * @returns Query string including the leading `?`
 */
export function buildRunsQuery(taskType: string, result: string, limit: number,): string {
  const params = new URLSearchParams({ limit: String(limit,), },);
  if (taskType) { params.set("taskType", taskType,); }
  if (result) { params.set("result", result,); }
  return `?${params.toString()}`;
}

/**
 * True when the user has moved on to a different run since a detail request
 * was issued, making that response stale and unsafe to render.
 * @param selectedRunId - Run id currently selected in the detail view
 * @param requestedRunId - Run id the in-flight request was for
 * @returns {boolean} true when the response must be discarded
 */
export function isStale(selectedRunId: string, requestedRunId: string,): boolean {
  return selectedRunId !== requestedRunId;
}

/**
 * Roll the stats totals into the stat-card model.
 * @param stats - Decoded `/api/v1/harness/stats` payload
 * @returns Card model: translated label + formatted value
 */
export function buildStatCards(stats: HarnessStats,): HarnessStatCard[] {
  return [
    { key: "runs", label: t("harness.runs",), value: String(stats.totals.runs,), },
    { key: "failures", label: t("harness.failures",), value: String(stats.totals.failures,), },
    { key: "avgMs", label: t("harness.avgDuration",), value: formatDuration(stats.totals.avgMs,), },
    { key: "costUsd", label: t("harness.totalCost",), value: formatUsd(stats.totals.costUsd,), },
    { key: "tokensIn", label: t("harness.tokensIn",), value: String(stats.totals.tokensIn,), },
    { key: "tokensOut", label: t("harness.tokensOut",), value: String(stats.totals.tokensOut,), },
  ];
}

/**
 * Shape the runs table rows.
 * @param runs - Decoded run summaries
 * @returns Rows with every cell already formatted
 */
export function buildRunRows(runs: HarnessRunSummary[],): HarnessRunRow[] {
  return runs.map((run,) => ({
    runId: run.runId,
    ts: formatRunTs(run.ts,),
    task: run.task,
    taskType: run.taskType,
    model: run.model,
    result: run.result,
    failed: run.result !== "ok",
    duration: formatDuration(run.durationMs,),
    cost: formatUsd(run.costUsd,),
    tokens: `${run.tokensIn}/${run.tokensOut}`,
    tools: run.toolCount,
    branch: textOrDash(run.branch,),
    gitSha: textOrDash(run.gitSha,),
  }));
}

/**
 * Rows after the client-side search. Matches task, type, model, result,
 * branch and sha — the fields an operator would type to find a run.
 * @param rows - The rows to filter
 * @param query - The operator's search text
 * @returns The rows matching the query (all of them when it is empty)
 */
export function filterHarnessRuns(rows: HarnessRunRow[], query: string,): HarnessRunRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) { return rows; }

  return rows.filter((row,) =>
    `${row.task} ${row.taskType} ${row.model} ${row.result} ${row.branch} ${row.gitSha}`.toLowerCase().includes(needle,)
  );
}

/**
 * Shape the per-model rollup table.
 * @param byModel - Decoded `stats.byModel` rows
 * @returns Rows with duration and cost already formatted
 */
export function buildModelRows(byModel: HarnessStats["byModel"],): HarnessModelRow[] {
  return byModel.map((row,) => ({
    model: row.model,
    runs: row.runs,
    failures: row.failures,
    avg: formatDuration(row.avgMs,),
    cost: formatUsd(row.costUsd,),
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
  }));
}

/**
 * The KNOWN capability names of a discovered model, in a fixed order.
 * @param caps - the entry's capability facts, or null when the table knows nothing
 * @returns the known names joined by a middot, or the dash when none is known
 */
function capabilityNames(caps: HarnessDiscoveredModel["capabilities"],): string {
  if (caps === null) { return textOrDash(null,); }
  const names: string[] = [];
  if (caps.supportsTools) { names.push("tools",); }
  if (caps.supportsVision) { names.push("vision",); }
  if (caps.supportsThinking) { names.push("thinking",); }
  return names.length > 0 ? names.join(" · ",) : textOrDash(null,);
}

/**
 * Shape the discovered-model table.
 * @param items - Decoded `GET /api/v1/harness/models` entries
 * @returns Rows with every cell already formatted
 */
export function buildDiscoveredModelRows(items: HarnessDiscoveredModel[],): HarnessDiscoveredModelRow[] {
  return items.map((item,) => {
    const caps = item.capabilities;
    return {
      profile: textOrDash(item.profile,),
      model: textOrDash(item.model,),
      source: item.source,
      reason: textOrDash(item.reason,),
      contextWindow: textOrDash(caps?.contextWindow ?? null,),
      maxOutput: textOrDash(caps?.maxOutput ?? null,),
      capabilities: capabilityNames(caps,),
      modalities: caps !== null && caps.modalities.length > 0 ? caps.modalities.join(", ",) : textOrDash(null,),
    };
  },);
}

/**
 * Shape the tooling-gap list.
 * @param gaps - Decoded `stats.toolingGaps` rows
 * @returns Gap rows ordered as the server sent them
 */
export function buildGapRows(gaps: HarnessStats["toolingGaps"],): HarnessGapRow[] {
  return gaps.map((gap,) => ({ toolingGap: gap.toolingGap, count: gap.count, }));
}

export { buildDetailView, type HarnessDetailView, } from "./admin-harness-detail-view";

export { formatDuration, formatUsd, } from "./admin-harness-format";
