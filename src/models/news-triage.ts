// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * News triage — ack/dismiss state for admin news items. Dismissed
 * ids live in one `ranking_snapshots` row (`source='news:triage'`)
 * so the state is a plain JSON array with the same idempotency and
 * freshness plumbing as every other snapshot. `latestNews` carries
 * the dismissed flags; the tab hides dismissed items. Versions carry
 * a monotonic counter before the random tail so same-millisecond
 * actions order by action order, not by UUID coin flip.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../utils";
import { toDate, } from "../utils/date";
import { freshSnapshot, storeSnapshot, } from "./snapshots";

export const NEWS_TRIAGE_REFRESH_MS = 30 * 24 * 3_600_000;

// Process-local action counter for version ordering (see module doc).
let triageVersionSeq = 0;

/**
 * Dismissed item ids, newest snapshot wins.
 * @param db
 */
export async function dismissedNewsIds(db: Kysely<DB>,): Promise<Set<string>> {
  const payload = await freshSnapshot(db, "news:triage", "",);
  const ids = payload ? jsonParseOr<string[]>(payload, [],) : [];
  return new Set(Array.isArray(ids,) ? ids.filter((id,) => typeof id === "string") : [],);
}

/**
 * Record one ack/dismiss. Appends a new snapshot version per action —
 * the newest row is the state; history shows who triaged what.
 * @param db
 * @param itemId - the news item id as served by `latestNews`
 * @param dismissed - true to dismiss, false to un-dismiss (ack)
 */
export async function triageNewsItem(db: Kysely<DB>, itemId: string, dismissed: boolean,): Promise<void> {
  const current = await dismissedNewsIds(db,);
  if (dismissed) { current.add(itemId,); }
  else { current.delete(itemId,); }

  const now = toDate();
  // ponytail: monotonic counter before the random tail — `freshSnapshot`
  // orders by version desc, so same-millisecond actions must sort by
  // action order, not by UUID coin flip.
  triageVersionSeq += 1;
  const seq = String(triageVersionSeq,).padStart(6, "0",);
  // Random suffix: two actions inside one millisecond must not share
  // a version - the snapshot store drops same-version second writes.
  await storeSnapshot(db, {
    source: "news:triage",
    version: `triage-${now.toISOString()}-${seq}-${crypto.randomUUID()}`,
    nextRefreshAfter: toDate(now.getTime() + NEWS_TRIAGE_REFRESH_MS,).toISOString(),
    rowCount: current.size,
    payload: jsonStringifyOr([...current,],),
    status: "ok",
  },);
}
