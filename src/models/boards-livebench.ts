// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LiveBench importer — the cleanest dated CSV set. The dated path
 * *is* the snapshot key: "the board as of date X" = fetch
 * `v1/table_<X with underscores>.csv`. No scraping, no key.
 * Per-release files 404 once superseded; a missing file skips the
 * release, never the import.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { toDate, } from "../utils/date";
import { type BoardRow, fetchBoardText, type FetchImpl, splitCsv, writeBoardRows, } from "./boards-shared";

/** Cache-buster the LiveBench SPA appends; harmless to include. */
export const LIVEBENCH_VERSION = "1793210445";
export const LIVEBENCH_REFRESH_MS = 24 * 3_600_000;

/** Dated release labels newest-first; verified live, underscore form only. */
export const LIVEBENCH_RELEASES = ["2026_06_25", "2026_03_15", "2025_12_20",];

export interface LiveBenchRow {
  modelId: string;
  mean: number;
  tasks: number;
  observedAt: string;
}

/**
 * Extract per-model mean scores from a dated table CSV. Column lookup
 * is by header name; the first column is the model name and the rest
 * are the objective task scores.
 * @param csv - raw `table_<YYYY_MM_DD>.csv` body
 * @param boardDate - the board's release date (the dated path is the snapshot key)
 */
export function parseLiveBenchCsv(csv: string, boardDate: string,): LiveBenchRow[] {
  const rows = splitCsv(csv,);
  if (rows.length < 2) { return []; }
  const header = rows[0]!.map((h,) => h.trim());
  const idIdx = header.indexOf("model",);
  if (idIdx < 0 || header.length < 2) { return []; }
  const observedAt = `${boardDate}T00:00:00.000Z`;
  if (Number.isNaN(toDate(observedAt,).getTime(),)) { return []; }
  const out: LiveBenchRow[] = [];
  for (const cells of rows.slice(1,)) {
    const row = scoreLiveBenchCells(cells, idIdx, observedAt,);
    if (row) { out.push(row,); }
  }

  return out;
}

function scoreLiveBenchCells(cells: string[], idIdx: number, observedAt: string,): LiveBenchRow | null {
  const id = cells[idIdx]?.trim();
  if (!id) { return null; }
  let sum = 0;
  let count = 0;
  for (let i = 0; i < cells.length; i++) {
    if (i === idIdx) { continue; }
    // Blank cells are missing scores, not zeros — Number("") is 0.
    if (cells[i]?.trim() === "") { continue; }
    const score = Number(cells[i],);
    if (!Number.isFinite(score,)) { continue; }
    sum += score;
    count++;
  }

  if (count === 0) { return null; }
  return { modelId: id, mean: sum / count, tasks: count, observedAt, };
}

/**
 * Fetch every configured LiveBench dated table and persist one
 * `model_rankings` row per model per release (metric `quality_score`).
 * @param db
 * @param fetchImpl - injectable for tests
 * @returns number of new ranking rows written
 */
export async function importLiveBench(db: Kysely<DB>, fetchImpl: FetchImpl = fetch,): Promise<number> {
  let written = 0;
  for (const release of LIVEBENCH_RELEASES) {
    const url = `https://livebench.ai/v1/table_${release}.csv?v=${LIVEBENCH_VERSION}`;
    const body = await fetchBoardText(fetchImpl, url,);
    if (body === null) {
      getLogger().child({ module: "model-boards", },).warn("livebench fetch failed", { release, },);
      continue;
    }

    const boardDate = release.replaceAll("_", "-",);
    const parsed = parseLiveBenchCsv(body, boardDate,);
    if (parsed.length === 0) { continue; }
    const rows: BoardRow[] = parsed.map((row,) => ({
      subjectKey: row.modelId,
      metric: "quality_score",
      value: row.mean,
      unit: "score",
      observedAt: row.observedAt,
      meta: { tasks: row.tasks, release, },
    }));

    written += await writeBoardRows(db, {
      source: "livebench",
      log: "livebench",
      snapshotVersion: `table-${release}`,
      snapshotSourceKey: release,
      refreshMs: LIVEBENCH_REFRESH_MS,
      url,
    }, rows,);
  }

  return written;
}
