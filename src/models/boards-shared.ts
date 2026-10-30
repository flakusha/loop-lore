// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared board-import plumbing: one timed fetch, one expiry helper,
 * one quality-row writer. Every importer is fetch → parse → snapshot
 * → record; only the parse step differs per board.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";
import { toDate, } from "../utils/date";
import { recordRanking, } from "./rankings";
import { storeSnapshot, } from "./snapshots";

export type FetchImpl = (url: string, init?: RequestInit,) => Promise<Response>;

export interface BoardRow {
  subjectKey: string;
  metric: string;
  value: number;
  unit: string;
  observedAt: string;
  meta?: Record<string, unknown>;
}

export interface BoardSpec {
  source: string;
  log: string;
  snapshotVersion: string;
  snapshotSourceKey?: string;
  refreshMs: number;
  nextRefreshAfter?: string;
  snapshotMeta?: Record<string, unknown>;
  url: string;
}

/**
 * Timed GET with a 60 s abort. Null on any failure — the caller
 * degrades to "skip this board", never to a throw.
 * @param fetchImpl - injectable for tests
 * @param url - board endpoint
 * @param timeoutMs - abort deadline
 */
export async function fetchBoardText(fetchImpl: FetchImpl, url: string, timeoutMs = 60_000,): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs,);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, },);
    if (!res.ok) { return null; }
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer,);
  }
}

/**
 * Minimal CSV splitter: quoted cells with embedded commas/newlines,
 * doubled quotes as escapes. Board CSVs carry commas inside quotes.
 * @param text - raw CSV body
 */
export function splitCsv(text: string,): string[][] {
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
 * Persist one `model_rankings` row per board row plus the snapshot
 * that lets the next run skip the network.
 * @param db
 * @param spec - board identity for snapshots and log lines
 * @param rows - parsed measurements
 * @returns number of new ranking rows written
 */
export async function writeBoardRows(db: Kysely<DB>, spec: BoardSpec, rows: BoardRow[],): Promise<number> {
  const now = toDate();
  await storeSnapshot(db, {
    source: spec.source,
    sourceKey: spec.snapshotSourceKey ?? "",
    version: spec.snapshotVersion,
    nextRefreshAfter: spec.nextRefreshAfter ?? toDate(now.getTime() + spec.refreshMs,).toISOString(),
    rowCount: rows.length,
    payload: jsonStringifyOr({
      url: spec.url,
      fetchedAt: now.toISOString(),
      rows: rows.length,
      ...(spec.snapshotMeta ?? {}),
    },),
    status: "ok",
  },);

  let written = 0;
  for (const row of rows) {
    const observed = toDate(row.observedAt,);
    const ok = await recordRanking(db, {
      scope: "global",
      scopeKey: "",
      subjectKey: row.subjectKey,
      metric: row.metric,
      value: row.value,
      unit: row.unit,
      basis: "imported",
      source: spec.source,
      sourceRef: spec.snapshotSourceKey,
      observedAt: row.observedAt,
      expiresAt: toDate(observed.getTime() + 180 * 86_400_000,).toISOString(),
      meta: (row.meta ?? null) as Record<string, unknown> | null,
    },);

    if (ok) { written++; }
  }

  getLogger().child({ module: "model-boards", },).info(`${spec.log} import complete`, { rows: rows.length, written, },);
  return written;
}
