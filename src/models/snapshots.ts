// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ranking Snapshots — the anti-re-fetch mechanism.
 *
 * One row per fetch: before hitting the network, look for a snapshot
 * row for (source, source_key) whose `next_refresh_after` is in the
 * future — if present, read `payload` and skip the fetch. The payload
 * also retains the upstream document verbatim so extraction is
 * replayable without a network call.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";

/**
 * Fresh snapshot payload, or null when no fresh snapshot exists.
 * @param db
 * @param source - e.g. 'ugi-csv', 'localmaxxing-leaderboard'
 * @param sourceKey - scope discriminator ('' | hw fingerprint | model id)
 */
export async function freshSnapshot(
  db: Kysely<DB>,
  source: string,
  sourceKey = "",
): Promise<string | null> {
  const now = new Date().toISOString();
  const row = await db
    .selectFrom("ranking_snapshots",)
    .where("source", "=", source,)
    .where("source_key", "=", sourceKey,)
    .where("next_refresh_after", ">", now,)
    .where("status", "=", "ok",)
    // fetched_at has second precision — version (an ISO instant)
    // breaks ties so the newest snapshot wins.
    .orderBy("fetched_at", "desc",)
    .orderBy("version", "desc",)
    .select("payload",)
    .executeTakeFirst();

  return row?.payload ?? null;
}

interface SnapshotRecord {
  source: string;
  sourceKey?: string;
  version: string;
  checksum?: string | null;
  nextRefreshAfter: string;
  rowCount?: number | null;
  payload: string;
  status?: string;
  lastError?: string | null;
}

/**
 * Store one fetch. Idempotent per (source, source_key, version).
 * @param db
 * @param record - the snapshot to store
 * @returns true when a new row was written
 */
export async function storeSnapshot(db: Kysely<DB>, record: SnapshotRecord,): Promise<boolean> {
  const sourceKey = record.sourceKey ?? "";
  const existing = await db
    .selectFrom("ranking_snapshots",)
    .where("source", "=", record.source,)
    .where("source_key", "=", sourceKey,)
    .where("version", "=", record.version,)
    .select("id",)
    .executeTakeFirst();

  if (existing) { return false; }

  await db
    .insertInto("ranking_snapshots",)
    .values({
      id: crypto.randomUUID(),
      source: record.source,
      source_key: sourceKey,
      version: record.version,
      checksum: record.checksum ?? null,
      next_refresh_after: record.nextRefreshAfter,
      row_count: record.rowCount ?? null,
      payload: record.payload,
      status: record.status ?? "ok",
      last_error: record.lastError ?? null,
    },)
    .execute();

  return true;
}
