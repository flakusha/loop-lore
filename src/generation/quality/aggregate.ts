// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quality metric aggregation (FEAT-062).
 *
 * Pure functions over grouped rows so the maths is unit-testable without a
 * database. The route supplies one row per (day, model, provider,
 * finishReason) bucket; this module folds those buckets into totals, a
 * per-model comparison and a daily trend series.
 */

/** Cap the per-model comparison table, mirroring the characters rollup. */
const MODEL_LIMIT = 50;

/** One grouped bucket of generations. */
export interface QualityGroupRow {
  /** UTC day bucket (YYYY-MM-DD). */
  day: string;
  model: string | null;
  provider: string | null;
  /** Raw provider finish reason, null when the generation did not record one. */
  finishReason: string | null;
  generations: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencySumMs: number;
  latencyCount: number;
  tokensPerSecondSum: number;
  tokensPerSecondCount: number;
  repetitionRateSum: number;
  repetitionRateCount: number;
}

/** Aggregate totals across every matched generation. */
export interface QualityTotals {
  generations: number;
  /** Generations that carry a recorded repetition rate. */
  withQualityMetrics: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  avgTokensPerSecond: number;
  avgRepetitionRate: number;
}

/** Per-model comparison row. */
export interface QualityModelStats {
  model: string | null;
  provider: string | null;
  generations: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  avgTokensPerSecond: number;
  avgRepetitionRate: number;
}

/** One point of the daily quality trend. */
export interface QualityTrendPoint {
  date: string;
  generations: number;
  totalTokens: number;
  avgLatencyMs: number;
  avgTokensPerSecond: number;
  avgRepetitionRate: number;
}

/** Finish-reason histogram entry. */
export interface QualityFinishReason {
  reason: string;
  count: number;
}

/** Full quality report returned by the analytics endpoint. */
export interface QualityReport {
  totals: QualityTotals;
  byModel: QualityModelStats[];
  trend: QualityTrendPoint[];
  finishReasons: QualityFinishReason[];
}

/** Mutable accumulator for a bucket of generations. */
interface Accumulator {
  generations: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencySumMs: number;
  latencyCount: number;
  tokensPerSecondSum: number;
  tokensPerSecondCount: number;
  repetitionRateSum: number;
  repetitionRateCount: number;
}

function emptyAccumulator(): Accumulator {
  return {
    generations: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    latencySumMs: 0,
    latencyCount: 0,
    tokensPerSecondSum: 0,
    tokensPerSecondCount: 0,
    repetitionRateSum: 0,
    repetitionRateCount: 0,
  };
}

function addRow(acc: Accumulator, row: QualityGroupRow,): void {
  acc.generations += row.generations;
  acc.promptTokens += row.promptTokens;
  acc.completionTokens += row.completionTokens;
  acc.totalTokens += row.totalTokens;
  acc.latencySumMs += row.latencySumMs;
  acc.latencyCount += row.latencyCount;
  acc.tokensPerSecondSum += row.tokensPerSecondSum;
  acc.tokensPerSecondCount += row.tokensPerSecondCount;
  acc.repetitionRateSum += row.repetitionRateSum;
  acc.repetitionRateCount += row.repetitionRateCount;
}

function avg(sum: number, count: number,): number {
  return count === 0 ? 0 : sum / count;
}

function round(value: number, digits: number,): number {
  const factor = 10 ** digits;
  return Math.round(value * factor,) / factor;
}

/** Totals derived from one or more accumulated buckets. */
function totalsOf(acc: Accumulator,): QualityTotals {
  return {
    generations: acc.generations,
    withQualityMetrics: acc.repetitionRateCount,
    promptTokens: acc.promptTokens,
    completionTokens: acc.completionTokens,
    totalTokens: acc.totalTokens,
    avgLatencyMs: Math.round(avg(acc.latencySumMs, acc.latencyCount,),),
    avgTokensPerSecond: round(avg(acc.tokensPerSecondSum, acc.tokensPerSecondCount,), 2,),
    avgRepetitionRate: round(avg(acc.repetitionRateSum, acc.repetitionRateCount,), 4,),
  };
}

/**
 * Fold grouped quality rows into the report shape.
 *
 * Averages are weighted by the number of generations that carried the metric,
 * so rows without a recorded latency or repetition rate never dilute the
 * average of the rows that do.
 * @param rows - grouped buckets, one per (day, model, provider, finishReason)
 * @returns totals, per-model comparison, daily trend and finish-reason histogram
 */
export function aggregateQuality(rows: QualityGroupRow[],): QualityReport {
  const overall = emptyAccumulator();
  const byModel = new Map<string, Accumulator>();
  const byDay = new Map<string, Accumulator>();
  const byFinishReason = new Map<string, number>();

  for (const row of rows) {
    addRow(overall, row,);

    const modelKey = `${row.model ?? ""}|${row.provider ?? ""}`;
    const modelAcc = byModel.get(modelKey,) ?? emptyAccumulator();
    addRow(modelAcc, row,);
    byModel.set(modelKey, modelAcc,);

    const dayAcc = byDay.get(row.day,) ?? emptyAccumulator();
    addRow(dayAcc, row,);
    byDay.set(row.day, dayAcc,);

    const reason = row.finishReason ?? "unknown";
    byFinishReason.set(reason, (byFinishReason.get(reason,) ?? 0) + row.generations,);
  }

  const models: QualityModelStats[] = [...byModel.entries(),].map(([key, acc,],) => {
    const [model, provider,] = key.split("|",);
    return {
      model: model ? model : null,
      provider: provider ? provider : null,
      generations: acc.generations,
      promptTokens: acc.promptTokens,
      completionTokens: acc.completionTokens,
      totalTokens: acc.totalTokens,
      avgLatencyMs: Math.round(avg(acc.latencySumMs, acc.latencyCount,),),
      avgTokensPerSecond: round(avg(acc.tokensPerSecondSum, acc.tokensPerSecondCount,), 2,),
      avgRepetitionRate: round(avg(acc.repetitionRateSum, acc.repetitionRateCount,), 4,),
    };
  },).sort((a, b,) => b.generations - a.generations || (a.model ?? "").localeCompare(b.model ?? "",));

  const trend: QualityTrendPoint[] = [...byDay.entries(),]
    .sort(([a,], [b,],) => a.localeCompare(b,))
    .map(([date, acc,],) => ({
      date,
      generations: acc.generations,
      totalTokens: acc.totalTokens,
      avgLatencyMs: Math.round(avg(acc.latencySumMs, acc.latencyCount,),),
      avgTokensPerSecond: round(avg(acc.tokensPerSecondSum, acc.tokensPerSecondCount,), 2,),
      avgRepetitionRate: round(avg(acc.repetitionRateSum, acc.repetitionRateCount,), 4,),
    }));

  const finishReasons: QualityFinishReason[] = [...byFinishReason.entries(),]
    .map(([reason, count,],) => ({ reason, count, }))
    .sort((a, b,) => b.count - a.count || a.reason.localeCompare(b.reason,));

  return {
    totals: totalsOf(overall,),
    byModel: models.slice(0, MODEL_LIMIT,),
    trend,
    finishReasons,
  };
}
