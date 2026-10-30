// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Global Boards — keyless leaderboard ingestion into `model_rankings`.
 *
 * UGI (Uncensored General Intelligence, DontPlanToEnd HF Space) is the
 * first importer and the template for the rest: a plain CSV at a stable
 * URL, no key, fetched on a 24 h cadence. Each CSV row becomes one
 * `model_rankings` row with scope='global', basis='imported'.
 *
 * Observed-at is the ROW's own `Test Date` (un-normalised M/D/YYYY),
 * never the file's upload date — file freshness and measurement
 * freshness differ by months for older entries.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";
import { toDate, } from "../utils/date";
import { recordRanking, } from "./rankings";
import { storeSnapshot, } from "./snapshots";

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
 * Minimal CSV splitter: quoted cells with embedded commas/newlines,
 * doubled quotes as escapes. UGI cells carry commas inside quotes.
 * @param text - raw CSV body
 */
function splitCsv(text: string,): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else { quoted = false; }
      } else { cell += ch; }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell,);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell,);
      cell = "";
      rows.push(row,);
      row = [];
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  row.push(cell,);
  if (row.length > 1 || row[0] !== "") { rows.push(row,); }
  return rows;
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

type FetchImpl = (url: string, init?: RequestInit,) => Promise<Response>;

/**
 * Fetch the UGI CSV and persist one `model_rankings` row per model
 * plus a `ranking_snapshots` row so the next run skips the network.
 * @param db
 * @param fetchImpl - injectable for tests
 * @returns number of new ranking rows written
 */
export async function importUgi(db: Kysely<DB>, fetchImpl: FetchImpl = fetch,): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000,);
  let body: string | null = null;
  try {
    const res = await fetchImpl(UGI_CSV_URL, { signal: controller.signal, },);
    if (res.ok) { body = await res.text(); }
  } catch {
    body = null;
  } finally {
    clearTimeout(timer,);
  }

  if (body === null) {
    getLogger().child({ module: "model-boards", },).warn("ugi fetch failed",);
    return 0;
  }

  const rows = parseUgiCsv(body,);
  if (rows.length === 0) { return 0; }
  const now = toDate();
  await storeSnapshot(db, {
    source: "ugi",
    version: `csv-${now.toISOString()}`,
    nextRefreshAfter: toDate(now.getTime() + UGI_REFRESH_MS,).toISOString(),
    rowCount: rows.length,
    payload: jsonStringifyOr({ url: UGI_CSV_URL, fetchedAt: now.toISOString(), rows: rows.length, },),
    status: "ok",
  },);

  let written = 0;
  for (const row of rows) {
    const observed = toDate(row.observedAt,);
    const ok = await recordRanking(db, {
      scope: "global",
      scopeKey: "",
      subjectKey: `hf:${row.modelId}`,
      metric: "quality_score",
      value: row.ugi,
      unit: "score",
      basis: "imported",
      source: "ugi",
      observedAt: row.observedAt,
      // Row date + 180 d per the freshness policy.
      expiresAt: toDate(observed.getTime() + 180 * 86_400_000,).toISOString(),
      meta: { willingness: row.willingness, },
    },);

    if (ok) { written++; }
  }

  getLogger().child({ module: "model-boards", },).info("ugi import complete", { rows: rows.length, written, },);
  return written;
}
