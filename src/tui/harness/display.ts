// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { HarnessRunDetail, HarnessRunSummary, } from "./types";

const MAX_TASK_LEN = 48;

/**
 * Format duration in milliseconds to a human-readable string.
 * @param ms
 */
export function formatDuration(ms: number,): string {
  if (ms < 1000) { return `${ms}ms`; }
  if (ms < 60_000) { return `${(ms / 1000).toFixed(1,)}s`; }
  const m = Math.floor(ms / 60_000,);
  const s = Math.floor((ms % 60_000) / 1000,);
  return `${m}m${s}s`;
}

/**
 * Truncate a task string to at most MAX_TASK_LEN characters, appending "…"
 * when truncation occurs.
 * @param task
 */
export function truncateTask(task: string,): string {
  if (task.length <= MAX_TASK_LEN) { return task; }
  return `${task.slice(0, MAX_TASK_LEN - 1,)}…`;
}

/**
 * Result marker character: ✔ for success, ✘ for failure.
 * @param summary
 */
export function resultMarker(summary: { result: string; error: string | null },): string {
  return summary.error !== null ? "{red-fg}✘{/red-fg}" : "{green-fg}✔{/green-fg}";
}

/**
 * Format a run summary as a one-line blessed markup string for list display.
 * Shape: `✔/✘  1m23s  task-name  [model]  result  +Ntok  $0.00`
 * @param summary
 */
export function formatRunLine(summary: HarnessRunSummary,): string {
  const marker = resultMarker(summary,);
  const dur = formatDuration(summary.durationMs,);
  const task = truncateTask(summary.task,);
  const model = summary.model;
  const result = summary.result;
  const tokens = summary.tokensIn + summary.tokensOut;
  const cost = (summary.costUsd ?? 0) < 0.001
    ? "$<0.001"
    : `$${(summary.costUsd ?? 0).toFixed((summary.costUsd ?? 0) < 0.01 ? 3 : 2,)}`;

  return `${marker}  ${dur}  ${task}  {blue-fg}[${model}]{/blue-fg}  ${result}  +${tokens}t  ${cost}`;
}

/**
 * Format a run detail as a multi-line blessed markup block for the info panel.
 * @param detail
 */
export function formatRunDetail(detail: HarnessRunDetail,): string {
  const marker = resultMarker(detail,);
  const ts = detail.ts ? detail.ts.slice(0, 19,).replace("T", " ",) : "—";
  const dur = formatDuration(detail.durationMs,);

  const lines: string[] = [
    `{bold}Run:{/bold} ${detail.runId}`,
    `{bold}Time:{/bold} ${ts}  {bold}Duration:{/bold} ${dur}`,
    `{bold}Task:{/bold} ${detail.task}`,
    `{bold}Type:{/bold} ${detail.taskType}  {bold}Model:{/bold} ${detail.model}`,
    `{bold}Result:{/bold} ${marker} ${detail.result}`,
  ];

  if (detail.error) {
    lines.push(`{bold}Error:{/bold} {red-fg}${detail.error}{/red-fg}`,);
  }

  lines.push(
    `{bold}Tokens:{/bold} +${detail.tokensIn}in / +${detail.tokensOut}out  {bold}Cost:{/bold} $${
      (detail.costUsd ?? 0).toFixed(4,)
    }`,
    `{bold}Tools:{/bold} ${detail.toolCount} (${detail.tools.join(", ",)})`,
    `{bold}Pattern:{/bold} ${detail.pattern}${detail.patternDetail ? ` / ${detail.patternDetail}` : ""}`,
  );

  if (detail.toolingGap) {
    lines.push(`{bold}Tooling gap:{/bold} ${detail.toolingGap}`,);
  }

  lines.push(
    `{bold}Branch:{/bold} ${detail.branch ?? "—"}  {bold}SHA:{/bold} ${
      detail.gitSha ? detail.gitSha.slice(0, 7,) : "—"
    }`,
    `{bold}PID:{/bold} ${detail.pid != null ? detail.pid : "—"}`,
  );

  if (detail.msg) {
    lines.push(`{bold}Msg:{/bold} ${detail.msg}`,);
  }

  return lines.join("\n",);
}

/**
 * Return an empty-state line when the runs list is empty.
 */
export function formatEmptyRuns(): string {
  return "{cyan-fg}No harness runs recorded yet.{/cyan-fg}";
}
