// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Display shaping for the Harness tab's DETAIL view: one run detail record ->
 * a flat, pre-formatted view model.
 *
 * Split from `admin-harness-rows.ts` because the list tables and the detail
 * panel are two different views fed by two different endpoints, and the detail
 * view model has no row counterpart to stay field-compatible with. The formatters
 * it shares with the row builders live in ./admin-harness-format.
 */
import { formatDuration, formatRunTs, formatUsd, textOrDash, } from "./admin-harness-format";
import type { HarnessRunDetail, } from "./admin-harness-rows";

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
  pid: string;
  turnId: string;
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
    // `msg`/`toolingGap` are null on the wire for a run that recorded none;
    // the view model is a string so the template binds them without a guard.
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
    branch: textOrDash(detail.branch,),
    gitSha: textOrDash(detail.gitSha,),
    pid: textOrDash(detail.pid,),
    turnId: textOrDash(detail.turnId,),
  };
}
