// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Local-only reports table for advisory mesh intel. Every write is scoped to
 * the authenticated peer origin; nothing here feeds an enforcement path.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { type IntelRecord, MAX_FEED_ENTRIES, } from "./intel";

/** One stored peer report. */
export interface StoredIntelRow {
  readonly action: string;
  readonly confidence: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly indicator: string;
  readonly nonce: string;
  readonly receivedAt: string;
  readonly sourcePeer: string;
  readonly type: string;
}

/**
 * Insert one report; a replayed nonce is skipped, not an error.
 * @param database instance-scoped handle
 * @param record validated peer report
 * @param receivedAt injected clock (tests)
 * @returns true when a new row was stored
 */
export async function recordIntel(
  database: Kysely<DB>,
  record: IntelRecord,
  receivedAt = new Date(),
): Promise<boolean> {
  const result = await database
    .insertInto("mesh_intel_reports",)
    .values({
      action: record.action,
      confidence: record.confidence,
      created_at: record.createdAt,
      expires_at: record.expiresAt,
      id: crypto.randomUUID(),
      indicator: record.indicator,
      nonce: record.nonce,
      received_at: receivedAt.toISOString(),
      source_peer: record.sourcePeer,
      type: record.type,
    },)
    .onConflict((oc,) => oc.columns(["source_peer", "nonce",],).doNothing())
    .executeTakeFirst();

  return Number(result?.numInsertedOrUpdatedRows ?? 0n,) > 0;
}

/**
 * Count active rows for one peer; bounded by the caller's cap.
 * @param database instance-scoped handle
 * @param origin authenticated peer origin
 * @param now injected clock (tests)
 * @returns active row count
 */
export async function countActiveForPeer(
  database: Kysely<DB>,
  origin: string,
  now = new Date(),
): Promise<number> {
  const rows = await database
    .selectFrom("mesh_intel_reports",)
    .select(["id",],)
    .where("source_peer", "=", origin,)
    .where("expires_at", ">", now.toISOString(),)
    .execute();

  return rows.length;
}

/**
 * Remove this peer's rows for one indicator. Scoped by authenticated origin.
 * @param database instance-scoped handle
 * @param indicator digest-form key
 * @param origin authenticated peer origin
 * @returns number of removed rows
 */
export async function delistIntelForPeer(
  database: Kysely<DB>,
  indicator: string,
  origin: string,
): Promise<number> {
  const result = await database
    .deleteFrom("mesh_intel_reports",)
    .where("indicator", "=", indicator,)
    .where("source_peer", "=", origin,)
    .executeTakeFirst();

  return Number(result?.numDeletedRows ?? 0n,);
}

/**
 * List active reports for a delta pull.
 * @param database instance-scoped handle
 * @param options injected clock, cursor, and row cap
 * @returns active rows, oldest first
 */
export async function listActiveIntel(
  database: Kysely<DB>,
  options: { limit?: number; now?: Date; since?: Date } = {},
): Promise<readonly StoredIntelRow[]> {
  let query = database
    .selectFrom("mesh_intel_reports",)
    .select([
      "action",
      "confidence",
      "created_at",
      "expires_at",
      "id",
      "indicator",
      "nonce",
      "received_at",
      "source_peer",
      "type",
    ],)
    .where("expires_at", ">", (options.now ?? new Date()).toISOString(),);

  if (options.since) {
    query = query.where("created_at", ">", options.since.toISOString(),);
  }

  const rows = await query
    .orderBy("created_at", "asc",)
    .limit(options.limit ?? MAX_FEED_ENTRIES,)
    .execute();

  return rows.map((row,) => ({
    action: row.action,
    confidence: row.confidence,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    indicator: row.indicator,
    nonce: row.nonce,
    receivedAt: row.received_at,
    sourcePeer: row.source_peer,
    type: row.type,
  }));
}

/**
 * Remove expired reports; keeps the table bounded without a timer.
 * @param database instance-scoped handle
 * @param now injected clock (tests)
 * @returns number of removed rows
 */
export async function pruneExpiredIntel(database: Kysely<DB>, now = new Date(),): Promise<number> {
  const result = await database
    .deleteFrom("mesh_intel_reports",)
    .where("expires_at", "<=", now.toISOString(),)
    .executeTakeFirst();

  return Number(result?.numDeletedRows ?? 0n,);
}
