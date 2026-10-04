// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness admin tab - display shaping: wire rows -> pre-formatted view models.
 */
import { describe, expect, test, } from "bun:test";
import {
  buildDetailView,
  buildGapRows,
  buildModelRows,
  buildRunRows,
  buildStatCards,
  formatDuration,
  formatUsd,
} from "./admin-harness-rows";

import { RUN, STATS, } from "./admin-harness-fixtures";
import type { HarnessRunDetail, } from "./admin-harness-rows";

describe("buildStatCards", () => {
  test("maps every total to a card with a pre-formatted value", () => {
    const cards = buildStatCards(STATS,);
    const byKey = new Map(cards.map((card,) => [card.key, card,]),);
    expect(cards,).toHaveLength(6,);
    expect(byKey.get("runs",)?.value,).toBe("12",);
    expect(byKey.get("failures",)?.value,).toBe("3",);
    expect(byKey.get("avgMs",)?.value,).toBe("2.4s",);
    expect(byKey.get("costUsd",)?.value,).toBe("$1.50",);
    expect(byKey.get("tokensIn",)?.value,).toBe("900",);
    expect(byKey.get("tokensOut",)?.value,).toBe("400",);
    for (const card of cards) { expect(card.label,).not.toBe("harness.card.runs",); }
  });

  test("zero totals still render six cards", () => {
    const cards = buildStatCards({
      ...STATS,
      totals: { runs: 0, failures: 0, costUsd: 0, tokensIn: 0, tokensOut: 0, avgMs: 0, },
    },);
    expect(cards.map((card,) => card.value),).toEqual([
      "0",
      "0",
      "0ms",
      "$0.00",
      "0",
      "0",
    ],);
  });
});

describe("buildRunRows", () => {
  test("pre-formats duration, cost and token pair; flags a failed run", () => {
    const [row,] = buildRunRows([
      RUN,
      { ...RUN, runId: "run-2", result: "error", error: "boom", },
    ],);
    expect(row?.runId,).toBe("run-1",);
    expect(row?.duration,).toBe("1.5s",);
    expect(row?.cost,).toBe("$0.25",);
    expect(row?.tokens,).toBe("100/40",);
    expect(row?.failed,).toBe(false,);
    expect(row?.branch,).toBe("feat/x",);
    expect(row?.ts,).not.toBe("2026-02-01T10:00:00.000Z",);

    const [, failed,] = buildRunRows([
      RUN,
      { ...RUN, runId: "run-2", result: "error", error: "boom", },
    ],);
    expect(failed?.runId,).toBe("run-2",);
    expect(failed?.failed,).toBe(true,);
  });

  test("an empty list yields no rows", () => {
    expect(buildRunRows([],),).toEqual([],);
  });
});

describe("buildModelRows / buildGapRows", () => {
  test("model rollup keeps counts and formats avg + cost", () => {
    const rows = buildModelRows(STATS.byModel,);
    expect(rows,).toHaveLength(2,);
    expect(rows[0],).toMatchObject({
      model: "gpt-5",
      runs: 8,
      failures: 1,
      avg: "1.2s",
      cost: "$1.00",
      tokensIn: 600,
      tokensOut: 200,
    },);
    expect(rows[1]?.avg,).toBe("5.4s",);
  });

  test("tooling gaps pass through unchanged", () => {
    expect(buildGapRows(STATS.toolingGaps,),).toEqual([{ toolingGap: "no-web-search", count: 4, },],);
  });
});

describe("formatDuration / formatUsd", () => {
  test("picks a sensible unit and survives junk input", () => {
    expect(formatDuration(340,),).toBe("340ms",);
    expect(formatDuration(1500,),).toBe("1.5s",);
    expect(formatDuration(240_000,),).toBe("4m",);
    expect(formatDuration(Number.NaN,),).toBe("-",);
    expect(formatUsd(Number.NaN,),).toBe("$0.00",);
    expect(formatUsd(0,),).toBe("$0.00",);
  });
});

describe("buildDetailView", () => {
  test("flattens the detail record for the activity view", () => {
    const detail: HarnessRunDetail = {
      ...RUN,
      tools: ["read", "edit",],
      pattern: "p1",
      patternDetail: "detail-1",
      toolingGap: "no-web-search",
      msg: "finished",
    };
    const view = buildDetailView(detail,);
    expect(view,).toMatchObject({
      runId: "run-1",
      task: "fix the parser",
      model: "gpt-5",
      duration: "1.5s",
      cost: "$0.25",
      pattern: "p1",
      patternDetail: "detail-1",
      toolingGap: "no-web-search",
      tools: ["read", "edit",],
      msg: "finished",
      gitSha: "abc1234",
      pid: 4242,
    },);
  });
});
