// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { escapeMarkup, } from "../markup";
import type { HarnessResult, HarnessRunDetail, HarnessRunSummary, HarnessStats, } from "./types";

const MAX_TASK_LEN = 48;
/** Highest ms that still renders as `NN.Ns`; 59_950 rounds up to a full minute. */
const LAST_SUB_MINUTE_MS = 59_950;

/**
 * Format duration in milliseconds to a human-readable string.
 * @param ms
 * @returns the duration as `NNms`, `NN.Ns` or `NmSSs`.
 */
export function formatDuration(ms: number,): string {
  if (ms < 1000) { return `${ms}ms`; }
  if (ms < LAST_SUB_MINUTE_MS) { return `${(ms / 1000).toFixed(1,)}s`; }
  const m = Math.floor(ms / 60_000,);
  const s = Math.floor((ms % 60_000) / 1000,);
  return `${m}m${s}s`;
}

/**
 * Truncate a task string to at most MAX_TASK_LEN characters, appending "…"
 * when truncation occurs.
 * @param task
 * @returns the task, shortened with a trailing ellipsis when too long.
 */
export function truncateTask(task: string,): string {
  if (task.length <= MAX_TASK_LEN) { return task; }
  return `${task.slice(0, MAX_TASK_LEN - 1,)}…`;
}

/**
 * Result marker character: ✔ for success, ✘ for failure.
 * @param summary
 * @param summary.result
 * @returns the green or red blessed marker for that result.
 */
export function resultMarker(summary: { result: HarnessResult },): string {
  return summary.result !== "ok" ? "{red-fg}✘{/red-fg}" : "{green-fg}✔{/green-fg}";
}

/**
 * Format a run summary as a one-line blessed markup string for list display.
 * Shape: `✔/✘  1m23s  task-name  [model]  result  +Ntok  $0.00`
 * @param summary
 * @returns the blessed markup line for the runs list.
 */
export function formatRunLine(summary: HarnessRunSummary,): string {
  const marker = resultMarker(summary,);
  const dur = formatDuration(summary.durationMs,);
  const task = truncateTask(summary.task,);
  const model = summary.model;
  const result = summary.result;
  const tokens = summary.tokensIn + summary.tokensOut;
  const cost = summary.costUsd < 0.001
    ? "$<0.001"
    : `$${summary.costUsd.toFixed(summary.costUsd < 0.01 ? 3 : 2,)}`;

  return `${marker}  ${dur}  ${escapeMarkup(task,)}  {blue-fg}[${escapeMarkup(model,)}]{/blue-fg}  ${
    escapeMarkup(result,)
  }  +${tokens}t  ${cost}`;
}

/**
 * Format a run detail as a multi-line blessed markup block for the info panel.
 * @param detail
 * @returns the newline-joined blessed markup block for the info panel.
 */
export function formatRunDetail(detail: HarnessRunDetail,): string {
  const marker = resultMarker(detail,);
  const ts = detail.ts ? detail.ts.slice(0, 19,).replace("T", " ",) : "—";
  const dur = formatDuration(detail.durationMs,);

  const lines: string[] = [
    `{bold}Run:{/bold} ${escapeMarkup(detail.runId,)}`,
    `{bold}Time:{/bold} ${ts}  {bold}Duration:{/bold} ${dur}`,
    `{bold}Task:{/bold} ${escapeMarkup(detail.task,)}`,
    `{bold}Type:{/bold} ${escapeMarkup(detail.taskType,)}  {bold}Model:{/bold} ${escapeMarkup(detail.model,)}`,
    `{bold}Result:{/bold} ${marker} ${escapeMarkup(detail.result,)}`,
  ];

  if (detail.error) {
    lines.push(`{bold}Error:{/bold} {red-fg}${escapeMarkup(detail.error,)}{/red-fg}`,);
  }

  lines.push(
    `{bold}Tokens:{/bold} +${detail.tokensIn}in / +${detail.tokensOut}out  {bold}Cost:{/bold} $${
      detail.costUsd.toFixed(4,)
    }`,
    `{bold}Tools:{/bold} ${detail.toolCount} (${escapeMarkup(detail.tools.join(", ",),)})`,
    `{bold}Pattern:{/bold} ${escapeMarkup(detail.pattern,)}${
      detail.patternDetail ? ` / ${escapeMarkup(detail.patternDetail,)}` : ""
    }`,
  );

  if (detail.toolingGap) {
    lines.push(`{bold}Tooling gap:{/bold} ${escapeMarkup(detail.toolingGap,)}`,);
  }

  lines.push(
    `{bold}Branch:{/bold} ${escapeMarkup(detail.branch ?? "—",)}  {bold}SHA:{/bold} ${
      detail.gitSha ? escapeMarkup(detail.gitSha.slice(0, 7,),) : "—"
    }`,
    `{bold}PID:{/bold} ${detail.pid != null ? detail.pid : "—"}  {bold}Turn:{/bold} ${
      escapeMarkup(detail.turnId ?? "—",)
    }`,
  );

  if (detail.msg) {
    lines.push(`{bold}Msg:{/bold} ${escapeMarkup(detail.msg,)}`,);
  }

  return lines.join("\n",);
}

/**
 * Return an empty-state line when the runs list is empty.
 * @returns the empty-state markup line.
 */
export function formatEmptyRuns(): string {
  return "{cyan-fg}No harness runs recorded yet.{/cyan-fg}";
}

export function formatStats(stats: HarnessStats,): string {
  const { totals, byModel, byTaskType, } = stats;
  const lines: string[] = [
    `{bold}Stats{/bold}  {bold}Runs:{/bold} ${totals.runs}  {bold}Failures:{/bold} ${totals.failures}  {bold}Cost:{/bold} $${
      totals.costUsd.toFixed(4,)
    }`,
  ];

  if (byModel.length > 0) {
    lines.push(`{bold}By model:{/bold} ${byModel.map((m,) => `${m.model}=${m.runs}`).join(", ",)}`,);
  }

  if (byTaskType.length > 0) {
    lines.push(`{bold}By type:{/bold} ${byTaskType.map((t,) => `${t.taskType}=${t.runs}`).join(", ",)}`,);
  }

  return lines.join("\n",);
}
