// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Display shaping for the Harness tab: wire rows -> pre-formatted view models.
 *
 * Kept apart from `admin-harness.ts` so the component holds only state +
 * fetch, and so the formatters are unit-testable without an Alpine object.
 * The template binds these values directly — no formatting lives in markup.
 */
import type { Static, } from "@sinclair/typebox";
import {
  HarnessRunDetailSchema,
  HarnessRunSummarySchema,
  HarnessStatsSchema,
} from "./admin-harness-schema";
import { formatDisplayDate, } from "./chat-utils/time";
import { t, } from "./i18n";

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

/** One tooling-gap row. */
export interface HarnessGapRow {
  toolingGap: string;
  count: number;
}

/** The activity/detail view for a single run. */
export interface HarnessDetailView {
  runId: string;
  ts: string;
  task: string;
  msg: string;
  result: string;
  failed: boolean;
  pattern: string;
  patternDetail: string;
  toolingGap: string;
  tools: string[];
  duration: string;
  cost: string;
  model: string;
  branch: string;
  gitSha: string;
  pid: number;
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
 * Format a millisecond span for a stat card or table cell.
 * @param ms - Duration in milliseconds
 * @returns Compact human string, e.g. `340ms` / `1.2s` / `4m`
 */
export function formatDuration(ms: number,): string {
  if (!Number.isFinite(ms,)) { return "-"; }
  if (ms < 1000) { return `${Math.round(ms,)}ms`; }
  if (ms < 60_000) { return `${(ms / 1000).toFixed(1,)}s`; }
  return `${Math.round(ms / 60_000,)}m`;
}

/**
 * Format a USD amount at cent precision. Sub-cent spend still reads `$0.00`
 * rather than an empty cell.
 * @param usd - Amount in US dollars
 * @returns `$`-prefixed amount with two decimals
 */
export function formatUsd(usd: number,): string {
  if (!Number.isFinite(usd,)) { return "$0.00"; }
  return `$${usd.toFixed(2,)}`;
}

/**
 * Render a wire timestamp for display, falling back to the raw value when the
 * formatter cannot parse it — a malformed ts must not blank the cell.
 * @param ts - ISO timestamp from the wire
 * @returns Localized date-time, or the raw string
 */
function formatRunTs(ts: string,): string {
  return formatDisplayDate(ts, "datetime",) || ts;
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
    branch: run.branch,
    gitSha: run.gitSha,
  }));
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
 * Shape the tooling-gap list.
 * @param gaps - Decoded `stats.toolingGaps` rows
 * @returns Gap rows ordered as the server sent them
 */
export function buildGapRows(gaps: HarnessStats["toolingGaps"],): HarnessGapRow[] {
  return gaps.map((gap,) => ({ toolingGap: gap.toolingGap, count: gap.count, }));
}

/**
 * Shape the activity/detail view for one run.
 * @param detail - Decoded run detail record
 * @returns Flat view model; `toolingGap` is "" when the run has no gap
 */
export function buildDetailView(detail: HarnessRunDetail,): HarnessDetailView {
  return {
    runId: detail.runId,
    ts: formatRunTs(detail.ts,),
    task: detail.task,
    // `msg` is null on the wire for a run that recorded no note; the view
    // model is a string so the template can bind it without a guard.
    msg: detail.msg ?? "",
    result: detail.result,
    failed: detail.result !== "ok",
    pattern: detail.pattern,
    patternDetail: detail.patternDetail,
    toolingGap: detail.toolingGap ?? "",
    tools: detail.tools,
    duration: formatDuration(detail.durationMs,),
    cost: formatUsd(detail.costUsd,),
    model: detail.model,
    branch: detail.branch,
    gitSha: detail.gitSha,
    pid: detail.pid,
  };
}
