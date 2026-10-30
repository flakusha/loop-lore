// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LiveCodeBench importer — one JSON file with per-question
 * granularity: (model, question, date) triples with pass@1. The best
 * ingestion target in the survey: one file, no key, no scraping,
 * time-bounded by `date`.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonParseOr, } from "../utils";
import { toDate, } from "../utils/date";
import { type BoardRow, fetchBoardText, type FetchImpl, writeBoardRows, } from "./boards-shared";

export const LIVECODEBENCH_JSON_URL = "https://livecodebench.github.io/performances_generation.json";
export const LIVECODEBENCH_REFRESH_MS = 24 * 3_600_000;

export interface LiveCodeBenchAggregate {
  model: string;
  meanPassAt1: number;
  questions: number;
  observedAt: string;
}

interface NewestPerf {
  passAt1: number;
  date: number;
}

function newestByQuestion(performances: unknown[],): Map<string, NewestPerf> {
  const newest = new Map<string, NewestPerf>();
  for (const entry of performances) {
    if (typeof entry !== "object" || entry === null) { continue; }
    const row = entry as Record<string, unknown>;
    const model = typeof row["model"] === "string" ? row["model"] : null;
    const questionId = typeof row["question_id"] === "string" ? row["question_id"] : null;
    const passAt1 = typeof row["pass@1"] === "number" ? row["pass@1"] : NaN;
    const date = typeof row["date"] === "number" ? row["date"] : NaN;
    if (!model || !questionId || !Number.isFinite(passAt1,) || !Number.isFinite(date,)) { continue; }
    const key = `${model} ${questionId}`;
    const prev = newest.get(key,);
    if (!prev || date > prev.date) { newest.set(key, { passAt1, date, },); }
  }

  return newest;
}

/**
 * Aggregate per-question pass@1 by model, newest-wins per
 * (model, question): re-runs of the same question supersede older ones.
 * observed-at is the newest question date in the model's bucket.
 * @param performances - raw `performances` array from the JSON file
 */
export function aggregateLiveCodeBench(performances: unknown,): LiveCodeBenchAggregate[] {
  if (!Array.isArray(performances,)) { return []; }
  const newest = newestByQuestion(performances,);
  const byModel = new Map<string, { sum: number; count: number; latest: number }>();
  for (const [key, perf,] of newest) {
    const model = key.slice(0, key.lastIndexOf(" ",),);
    const bucket = byModel.get(model,) ?? { sum: 0, count: 0, latest: 0, };
    bucket.sum += perf.passAt1;
    bucket.count++;
    bucket.latest = Math.max(bucket.latest, perf.date,);
    byModel.set(model, bucket,);
  }

  const out: LiveCodeBenchAggregate[] = [];
  for (const [model, bucket,] of byModel) {
    out.push({
      model,
      meanPassAt1: bucket.sum / bucket.count,
      questions: bucket.count,
      observedAt: toDate(bucket.latest,).toISOString(),
    },);
  }

  return out;
}

/**
 * Fetch the LiveCodeBench performances file and persist one
 * `model_rankings` row per model (metric `pass_at_1`, unit
 * `percent`). The file is ~7 MB raw — streamed once to text.
 * @param db
 * @param fetchImpl - injectable for tests
 * @returns number of new ranking rows written
 */
export async function importLiveCodeBench(db: Kysely<DB>, fetchImpl: FetchImpl = fetch,): Promise<number> {
  const body = await fetchBoardText(fetchImpl, LIVECODEBENCH_JSON_URL, 120_000,);
  if (body === null) {
    getLogger().child({ module: "model-boards", },).warn("livecodebench fetch failed",);
    return 0;
  }

  const parsed = jsonParseOr<unknown>(body, null,);
  if (parsed === null) { return 0; }

  const rows = aggregateLiveCodeBench(
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)["performances"]
      : null,
  );

  if (rows.length === 0) { return 0; }
  const board: BoardRow[] = rows.map((row,) => ({
    subjectKey: row.model,
    metric: "pass_at_1",
    value: row.meanPassAt1,
    unit: "percent",
    observedAt: row.observedAt,
    meta: { questions: row.questions, },
  }));

  return writeBoardRows(db, {
    source: "livecodebench",
    log: "livecodebench",
    snapshotVersion: `performances-${toDate().toISOString()}`,
    refreshMs: LIVECODEBENCH_REFRESH_MS,
    url: LIVECODEBENCH_JSON_URL,
    snapshotMeta: { models: rows.length, },
  }, board,);
}
