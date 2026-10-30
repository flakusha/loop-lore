// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Hallucinations Leaderboard importer — the one board that ranks
 * local models only (Yi-1.5-9B-Chat, Mistral-7B, …), frozen at
 * 2024-10-31. The HF dataset tree lists per-model
 * `results_<ISO-timestamp>.json` files; the filename timestamps *are*
 * the history. We ingest the tree listing only — no 224 KB
 * result-file fetches — and persist one row per model (newest run).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonParseOr, } from "../utils";
import { toDate, } from "../utils/date";
import { type BoardRow, fetchBoardText, type FetchImpl, writeBoardRows, } from "./boards-shared";

export const HALLUCINATIONS_TREE_URL =
  "https://huggingface.co/api/datasets/hallucinations-leaderboard/results/tree/main";
export const HALLUCINATIONS_REFRESH_MS = 24 * 3_600_000;

export interface HallucinationsRun {
  modelId: string;
  observedAt: string;
}

/**
 * Extract (model, run-date) pairs from an HF dataset tree listing.
 * Paths look like `01-ai/Yi-1.5-9B-Chat/results_2024-10-28 17:58:12.108008.json`.
 * @param tree - raw `/tree/main` JSON body
 */
export function parseHallucinationsTree(tree: string,): HallucinationsRun[] {
  const parsed = jsonParseOr<unknown>(tree, null,);
  if (parsed === null) { return []; }

  const entries = Array.isArray(parsed,)
    ? parsed
    : typeof parsed === "object" && parsed !== null
    ? [parsed,]
    : [];

  const out: HallucinationsRun[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) { continue; }
    const path = (entry as Record<string, unknown>)["path"];
    if (typeof path !== "string") { continue; }
    const match = /^(.+)\/results_(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}).*\.json$/.exec(path,);
    if (!match) { continue; }
    const modelId = match[1]!;
    const observedAt = `${match[2]}T${match[3]}Z`;
    if (Number.isNaN(toDate(observedAt,).getTime(),)) { continue; }
    out.push({ modelId, observedAt, },);
  }

  return out;
}

/**
 * Fetch the Hallucinations tree listing and persist one
 * `model_rankings` row per model for its newest run (metric
 * `accuracy`; the tree carries dates, not scores — the score lives
 * in the per-run result files and is fetched on demand, never
 * bulk-pulled). Frozen board: a single versioned snapshot suffices.
 * @param db
 * @param fetchImpl - injectable for tests
 * @returns number of new ranking rows written
 */
export async function importHallucinations(db: Kysely<DB>, fetchImpl: FetchImpl = fetch,): Promise<number> {
  const body = await fetchBoardText(fetchImpl, HALLUCINATIONS_TREE_URL,);
  if (body === null) {
    getLogger().child({ module: "model-boards", },).warn("hallucinations fetch failed",);
    return 0;
  }

  const runs = parseHallucinationsTree(body,);
  if (runs.length === 0) { return 0; }
  // Newest run per model — the board is frozen, so this is stable.
  const newest = new Map<string, string>();
  for (const run of runs) {
    if ((newest.get(run.modelId,) ?? "") < run.observedAt) { newest.set(run.modelId, run.observedAt,); }
  }

  const rows: BoardRow[] = [...newest,].map(([modelId, observedAt,],) => ({
    subjectKey: `hf:${modelId}`,
    metric: "accuracy",
    value: 0,
    unit: "score",
    observedAt,
    meta: { frozen: true, },
  }));

  return writeBoardRows(db, {
    source: "hallucinations-leaderboard",
    log: "hallucinations",
    snapshotVersion: "tree-2024-10-31",
    refreshMs: HALLUCINATIONS_REFRESH_MS,
    url: HALLUCINATIONS_TREE_URL,
    snapshotMeta: { models: newest.size, },
  }, rows,);
}
