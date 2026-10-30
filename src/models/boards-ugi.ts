// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * UGI importer — Uncensored General Intelligence (DontPlanToEnd HF
 * Space), a plain CSV at a stable URL, no key, 24 h cadence. Each
 * row becomes one `model_rankings` row with scope='global',
 * basis='imported'. Observed-at is the ROW's own `Test Date`
 * (un-normalised M/D/YYYY), never the file's upload date.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { toDate, } from "../utils/date";
import { type BoardRow, fetchBoardText, type FetchImpl, splitCsv, writeBoardRows, } from "./boards-shared";

export const UGI_CSV_URL =
  "https://huggingface.co/spaces/DontPlanToEnd/UGI-Leaderboard/raw/main/ugi-leaderboard-data.csv";
export const UGI_REFRESH_MS = 24 * 3_600_000;

/** One extracted UGI measurement. */
export interface UgiRow {
  modelId: string;
  ugi: number;
  willingness: number | null;
  observedAt: string;
}

/**
 * Parse `M/D/YYYY` (the CSV's un-normalised date form) to ISO.
 * Returns null for anything unparseable — a bad date skips the row,
 * never the import.
 * @param raw - the raw `Test Date` cell
 */
export function parseUgiDate(raw: string,): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim(),);
  if (!match) { return null; }
  const month = Number(match[1],);
  const day = Number(match[2],);
  const iso = `${match[3]}-${String(month,).padStart(2, "0",)}-${String(day,).padStart(2, "0",)}T00:00:00.000Z`;
  const check = toDate(iso,);
  if (Number.isNaN(check.getTime(),)) { return null; }
  // Reject calendar-impossible cells the Date constructor normalises.
  if (check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) { return null; }
  return iso;
}

/**
 * Extract measurements from the UGI CSV body. Column lookup is by
 * header name so a column reorder upstream does not misalign values.
 * @param csv - raw CSV body
 */
export function parseUgiCsv(csv: string,): UgiRow[] {
  const rows = splitCsv(csv,);
  if (rows.length === 0) { return []; }
  const header = rows[0]!.map((h,) => h.trim());
  const idIdx = header.indexOf("author/model_name",);
  const ugiIdx = header.indexOf("UGI 🏆",);
  const willIdx = header.indexOf("W/10 👍",);
  const testIdx = header.indexOf("Test Date",);
  if (idIdx < 0 || ugiIdx < 0 || testIdx < 0) { return []; }

  const out: UgiRow[] = [];
  for (const cells of rows.slice(1,)) {
    const id = cells[idIdx]?.trim();
    const observedAt = parseUgiDate(cells[testIdx] ?? "",);
    const ugi = Number(cells[ugiIdx],);
    if (!id || !observedAt || !Number.isFinite(ugi,)) { continue; }
    const willingness = willIdx >= 0 ? Number(cells[willIdx],) : NaN;
    out.push({ modelId: id, ugi, willingness: Number.isFinite(willingness,) ? willingness : null, observedAt, },);
  }

  return out;
}

/**
 * Fetch the UGI CSV and persist one `model_rankings` row per model.
 * @param db
 * @param fetchImpl - injectable for tests
 * @returns number of new ranking rows written
 */
export async function importUgi(db: Kysely<DB>, fetchImpl: FetchImpl = fetch,): Promise<number> {
  const body = await fetchBoardText(fetchImpl, UGI_CSV_URL,);
  if (body === null) {
    getLogger().child({ module: "model-boards", },).warn("ugi fetch failed",);
    return 0;
  }

  const parsed = parseUgiCsv(body,);
  if (parsed.length === 0) { return 0; }
  const rows: BoardRow[] = parsed.map((row,) => ({
    subjectKey: `hf:${row.modelId}`,
    metric: "quality_score",
    value: row.ugi,
    unit: "score",
    observedAt: row.observedAt,
    // Row date + 180 d per the freshness policy.
    meta: { willingness: row.willingness, },
  }));

  return writeBoardRows(db, {
    source: "ugi",
    log: "ugi",
    snapshotVersion: `csv-${toDate().toISOString()}`,
    refreshMs: UGI_REFRESH_MS,
    url: UGI_CSV_URL,
  }, rows,);
}
