// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for aggregateQuality (FEAT-062).
 *
 * Pure maths over grouped rows - no DB, no clock. The rules under test:
 * averages are weighted by the number of generations that actually carried the
 * metric, so a bucket without a recorded value never dilutes the average of
 * the buckets that have one.
 */
import { describe, expect, test, } from "bun:test";
import { aggregateQuality, } from "./aggregate";
import type { QualityGroupRow, } from "./aggregate";

/** A grouped bucket with sensible defaults; overrides win. */
function row(overrides: Partial<QualityGroupRow> = {},): QualityGroupRow {
  return {
    day: "2026-01-01",
    model: "model-a",
    provider: "prov-a",
    finishReason: "stop",
    generations: 1,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    latencySumMs: 0,
    latencyCount: 0,
    tokensPerSecondSum: 0,
    tokensPerSecondCount: 0,
    repetitionRateSum: 0,
    repetitionRateCount: 0,
    ...overrides,
  };
}

describe("aggregateQuality - empty input", () => {
  test("returns zeroed totals and empty arrays", () => {
    const report = aggregateQuality([],);

    expect(report.totals.generations,).toBe(0,);
    expect(report.totals.withQualityMetrics,).toBe(0,);
    expect(report.totals.promptTokens,).toBe(0,);
    expect(report.totals.completionTokens,).toBe(0,);
    expect(report.totals.totalTokens,).toBe(0,);
    expect(report.totals.avgLatencyMs,).toBe(0,);
    expect(report.totals.avgTokensPerSecond,).toBe(0,);
    expect(report.totals.avgRepetitionRate,).toBe(0,);
    expect(report.byModel,).toEqual([],);
    expect(report.trend,).toEqual([],);
    expect(report.finishReasons,).toEqual([],);
  });
});

describe("aggregateQuality - weighted averages", () => {
  test("a bucket without a repetition rate does not dilute the average", () => {
    const report = aggregateQuality([
      row({ generations: 1, repetitionRateSum: 0.5, repetitionRateCount: 1, },),
      row({ generations: 9, repetitionRateSum: 0, repetitionRateCount: 0, },),
    ],);

    // 0.5 / 1 measured generation - not 0.5 / 10 generations.
    expect(report.totals.avgRepetitionRate,).toBe(0.5,);
    expect(report.totals.withQualityMetrics,).toBe(1,);
    expect(report.totals.generations,).toBe(10,);
  });

  test("a bucket without a latency does not dilute the average", () => {
    const report = aggregateQuality([
      row({ generations: 1, latencySumMs: 1000, latencyCount: 1, },),
      row({ generations: 9, latencySumMs: 0, latencyCount: 0, },),
    ],);

    expect(report.totals.avgLatencyMs,).toBe(1000,);
  });

  test("the average is the mean over the measured generations only", () => {
    const report = aggregateQuality([
      row({ generations: 1, repetitionRateSum: 0.2, repetitionRateCount: 1, },),
      row({ generations: 3, repetitionRateSum: 0.6, repetitionRateCount: 3, },),
    ],);

    // (0.2 + 0.6) / 4 measured generations = 0.2
    expect(report.totals.avgRepetitionRate,).toBe(0.2,);
  });
});

describe("aggregateQuality - byModel folding", () => {
  test("rows of the same model and provider fold into one row", () => {
    const report = aggregateQuality([
      row({ day: "2026-01-01", generations: 2, totalTokens: 100, },),
      row({ day: "2026-01-02", generations: 3, totalTokens: 200, },),
    ],);

    expect(report.byModel.length,).toBe(1,);
    expect(report.byModel[0]?.model,).toBe("model-a",);
    expect(report.byModel[0]?.provider,).toBe("prov-a",);
    expect(report.byModel[0]?.generations,).toBe(5,);
    expect(report.byModel[0]?.totalTokens,).toBe(300,);
  });

  test("different models stay separate and sort by generations descending", () => {
    const report = aggregateQuality([
      row({ model: "model-b", generations: 1, },),
      row({ model: "model-a", generations: 5, },),
    ],);

    expect(report.byModel.map((m,) => m.model),).toEqual(["model-a", "model-b",],);
  });
});

describe("aggregateQuality - trend folding", () => {
  test("same-day rows fold and days sort ascending", () => {
    const report = aggregateQuality([
      row({ day: "2026-01-03", generations: 1, totalTokens: 30, },),
      row({ day: "2026-01-01", generations: 2, totalTokens: 10, },),
      row({ day: "2026-01-01", generations: 3, totalTokens: 20, },),
    ],);

    expect(report.trend.map((t,) => t.date),).toEqual(["2026-01-01", "2026-01-03",],);
    expect(report.trend[0]?.generations,).toBe(5,);
    expect(report.trend[0]?.totalTokens,).toBe(30,);
    expect(report.trend[1]?.generations,).toBe(1,);
  });
});

describe("aggregateQuality - finish reasons", () => {
  test("counts each reason and sorts by count descending", () => {
    const report = aggregateQuality([
      row({ finishReason: "stop", generations: 2, },),
      row({ finishReason: "length", generations: 5, },),
    ],);

    expect(report.finishReasons,).toEqual([
      { reason: "length", count: 5, },
      { reason: "stop", count: 2, },
    ],);
  });

  test("a null reason is bucketed as unknown", () => {
    const report = aggregateQuality([row({ finishReason: null, generations: 3, },),],);

    expect(report.finishReasons,).toEqual([{ reason: "unknown", count: 3, },],);
  });
});
