// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared fixtures for the Harness admin-tab tests. One definition, so the
 * component tests and the shaping tests cannot drift apart.
 */
import type { HarnessRunDetail, HarnessRunSummary, HarnessStats, } from "./admin-harness-rows";

/** A representative `GET /api/v1/harness/runs` row. */
export const RUN = {
  runId: "run-1",
  ts: "2026-02-01T10:00:00.000Z",
  durationMs: 1500,
  task: "fix the parser",
  taskType: "harnessCode",
  model: "gpt-5",
  toolCount: 3,
  result: "ok",
  error: null,
  costUsd: 0.25,
  tokensIn: 100,
  tokensOut: 40,
  branch: "feat/x",
  gitSha: "abc1234",
  pid: 4242,
} satisfies HarnessRunSummary;

/** A `GET /api/v1/harness/runs/:runId` record derived from `RUN`. */
export const DETAIL: HarnessRunDetail = {
  ...RUN,
  tools: [],
  pattern: "",
  patternDetail: "",
  toolingGap: "",
  msg: "m",
};

/** A representative `GET /api/v1/harness/stats` body. */
export const STATS: HarnessStats = {
  totals: { runs: 12, failures: 3, costUsd: 1.5, tokensIn: 900, tokensOut: 400, avgMs: 2400, },
  byModel: [
    { model: "gpt-5", runs: 8, failures: 1, avgMs: 1200, costUsd: 1, tokensIn: 600, tokensOut: 200, },
    { model: "opus", runs: 4, failures: 2, avgMs: 5400, costUsd: 0.5, tokensIn: 300, tokensOut: 200, },
  ],
  byTaskType: [{ taskType: "harnessCode", runs: 12, failures: 3, avgMs: 2400, },],
  byPattern: [{ pattern: "p1", runs: 5, failures: 1, },],
  toolingGaps: [{ toolingGap: "no-web-search", count: 4, },],
};
