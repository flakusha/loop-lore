// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LMArena (arena.ai) statistics via the published HF dataset — never
 * the site. `arena.ai/robots.txt` disallows `/api/` and the endpoints
 * 403 plain clients; the `lmarena-ai/leaderboard-dataset` (cc-by-4.0)
 * is the intended ingestion surface (`text_style_control` config,
 * `latest` split, category `overall`). Bradley-Terry rating per model
 * with vote counts; the `license` column marks open-weight models.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonParseOr, } from "../utils";
import { toDate, } from "../utils/date";
import { type BoardRow, fetchBoardText, type FetchImpl, writeBoardRows, } from "./boards-shared";

export const LMARENA_ROWS_URL = "https://datasets-server.huggingface.co/rows";
export const LMARENA_DATASET = "lmarena-ai/leaderboard-dataset";
export const LMARENA_CONFIG = "text_style_control";
export const LMARENA_REFRESH_MS = 24 * 3_600_000;

export interface LmarenaRow {
  modelName: string;
  rating: number;
  rank: number | null;
  voteCount: number | null;
  observedAt: string;
}

function lmarenaRowsUrl(offset: number, limit: number,): string {
  const params = new URLSearchParams({
    dataset: LMARENA_DATASET,
    config: LMARENA_CONFIG,
    split: "latest",
    offset: String(offset,),
    limit: String(limit,),
  },);

  return `${LMARENA_ROWS_URL}?${params.toString()}`;
}

function lmarenaEntry(row: unknown,): LmarenaRow | null {
  if (typeof row !== "object" || row === null) { return null; }
  const record = row as Record<string, unknown>;
  const modelName = typeof record["model_name"] === "string" ? record["model_name"] : null;
  const rating = typeof record["rating"] === "number" ? record["rating"] : NaN;
  const date = typeof record["leaderboard_publish_date"] === "string" ? record["leaderboard_publish_date"] : null;
  const category = typeof record["category"] === "string" ? record["category"] : null;
  if (!modelName || !Number.isFinite(rating,) || !date || category !== "overall") { return null; }
  const observedAt = `${date}T00:00:00.000Z`;
  if (Number.isNaN(toDate(observedAt,).getTime(),)) { return null; }
  const rank = typeof record["rank"] === "number" ? record["rank"] : null;
  const voteCount = typeof record["vote_count"] === "number" ? record["vote_count"] : null;
  return { modelName, rating, rank, voteCount, observedAt, };
}

/**
 * Extract arena rows from one datasets-server page. The category
 * filter keeps the board to `overall` — per-language/per-industry
 * splits are the same models re-ranked, not new opinions.
 * @param page - raw datasets-server rows JSON body
 */
export function parseLmarenaPage(page: string,): LmarenaRow[] {
  const parsed = jsonParseOr<unknown>(page, null,);
  if (parsed === null) { return []; }

  if (typeof parsed !== "object" || parsed === null) { return []; }
  const rows = (parsed as Record<string, unknown>)["rows"];
  if (!Array.isArray(rows,)) { return []; }
  const out: LmarenaRow[] = [];
  for (const entry of rows) {
    if (typeof entry !== "object" || entry === null) { continue; }
    const hit = lmarenaEntry((entry as Record<string, unknown>)["row"],);
    if (hit) { out.push(hit,); }
  }

  return out;
}

/**
 * Page through the datasets-server `latest` split (100 rows/page)
 * and persist one `model_rankings` row per model (metric
 * `arena_score`, unit `bradley-terry`). Paging stops on the first
 * empty/short page.
 * @param db
 * @param fetchImpl - injectable for tests
 * @param maxPages - paging cap (the full config is ~11k rows)
 * @returns number of new ranking rows written
 */
export async function importLmarena(db: Kysely<DB>, fetchImpl: FetchImpl = fetch, maxPages = 120,): Promise<number> {
  const now = toDate();
  let written = 0;
  let models = 0;
  for (let page = 0; page < maxPages; page++) {
    const body = await fetchBoardText(fetchImpl, lmarenaRowsUrl(page * 100, 100,),);
    if (body === null) {
      getLogger().child({ module: "model-boards", },).warn("lmarena fetch failed", { page, },);
      return written;
    }

    const parsed = parseLmarenaPage(body,);
    if (parsed.length === 0) { break; }
    const rows: BoardRow[] = parsed.map((row,) => ({
      subjectKey: row.modelName,
      metric: "arena_score",
      value: row.rating,
      unit: "bradley-terry",
      observedAt: row.observedAt,
      meta: { rank: row.rank, votes: row.voteCount, },
    }));

    models += rows.length;
    written += await writeBoardRows(db, {
      source: "lmarena",
      log: "lmarena",
      snapshotVersion: `latest-${now.toISOString()}-p${page}`,
      refreshMs: LMARENA_REFRESH_MS,
      url: LMARENA_ROWS_URL,
      snapshotMeta: { dataset: LMARENA_DATASET, config: LMARENA_CONFIG, page, },
    }, rows,);

    if (parsed.length < 100) { break; }
  }

  getLogger().child({ module: "model-boards", },).info("lmarena import complete", { models, written, },);
  return written;
}
