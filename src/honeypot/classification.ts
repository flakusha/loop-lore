// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Local classification store (design §10, S2).
 * Pure classifier first; database functions are insert-only and logs-only.
 * A hit on a disallowed path is suspicion, never proof — proof requires a
 * unique decoy token replayed into a real surface, which is not built here.
 */
import type { Kysely, } from "kysely";
import { createHmac, randomBytes, } from "node:crypto";
import type { DB, } from "../db/schema";
import { toDate, } from "../utils/date";
import type { DecoyHit, } from "./decoy-listener";

/** Suspicion is a path/behavior signal; proof is reserved for token replay. */
export type IndicatorLabel = "proof" | "suspicion";

/** Only the local decoy produces labels in this slice. */
export type IndicatorSource = "decoy";

/** Pure result of classifying one decoy hit. */
export interface IndicatorClassification {
  readonly confidence: number;
  /** Digest-based key; never contains a raw IP or other PII. */
  readonly indicator: string;
  readonly label: IndicatorLabel;
  readonly source: IndicatorSource;
}

/** One stored label row with its lifetime. */
export interface IndicatorRow {
  readonly confidence: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly indicator: string;
  readonly label: IndicatorLabel;
  readonly source: IndicatorSource;
}

/** Lifetime of a local label. Short by design; no cross-instance reuse. */
export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Process-local key: correlatable within a run, unlinkable across restarts. */
const INDICATOR_KEY = randomBytes(32,);

/**
 * Classify a decoy hit. Benign or unrecognized hits are not stored.
 * @param hit - hit emitted by the decoy listener
 * @returns a suspicion label, or null when nothing should be recorded
 */
export function classifyDecoyHit(hit: DecoyHit,): IndicatorClassification | null {
  if (hit.kind === "robots" || hit.kind === "unknown") { return null; }

  const digest = createHmac("sha256", INDICATOR_KEY,)
    .update(hit.ip ?? "unknown",)
    .digest("hex",)
    .slice(0, 32,);

  return {
    confidence: hit.kind === "fake-auth" ? 0.6 : 0.4,
    indicator: `decoy:${digest}:${hit.kind}`,
    label: "suspicion",
    source: "decoy",
  };
}

/**
 * Store one classification row.
 * @param database - instance-scoped database handle
 * @param classification - pure classifier result
 * @param options - injected clock, TTL, and caller-supplied id (tests)
 * @returns the stored row
 */
export async function recordIndicator(
  database: Kysely<DB>,
  classification: IndicatorClassification,
  options: { id?: string; now?: Date; ttlMs?: number } = {},
): Promise<IndicatorRow> {
  const now = options.now ?? new Date();
  // Write-path pruning: without a timer, expired rows otherwise accumulate.
  await pruneExpiredIndicators(database, now,);
  const row: IndicatorRow = {
    confidence: classification.confidence,
    createdAt: now.toISOString(),
    expiresAt: toDate(now.getTime() + (options.ttlMs ?? DEFAULT_TTL_MS),).toISOString(),
    id: options.id ?? crypto.randomUUID(),
    indicator: classification.indicator,
    label: classification.label,
    source: classification.source,
  };

  await database.insertInto("honeypot_indicators",)
    .values({
      confidence: row.confidence,
      created_at: row.createdAt,
      expires_at: row.expiresAt,
      id: row.id,
      indicator: row.indicator,
      label: row.label,
      source: row.source,
    },)
    .execute();

  return row;
}

/**
 * List unexpired labels.
 * @param database - instance-scoped database handle
 * @param now - injected clock (tests)
 * @returns active rows, oldest first
 */
export async function listIndicators(database: Kysely<DB>, now = new Date(),): Promise<readonly IndicatorRow[]> {
  const rows = await database
    .selectFrom("honeypot_indicators",)
    .select(["confidence", "created_at", "expires_at", "id", "indicator", "label", "source",],)
    .where("expires_at", ">", now.toISOString(),)
    .orderBy("created_at", "asc",)
    .execute();

  return rows.map((row,) => ({
    confidence: row.confidence,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    indicator: row.indicator,
    label: row.label as IndicatorLabel,
    source: row.source as IndicatorSource,
  }));
}

/**
 * Kill switch helper: remove all local labels.
 * @param database - instance-scoped database handle
 * @returns number of deleted rows
 */
export async function clearIndicators(database: Kysely<DB>,): Promise<number> {
  const result = await database.deleteFrom("honeypot_indicators",).executeTakeFirst();
  return Number(result?.numDeletedRows ?? 0n,);
}

/**
 * Remove expired labels; keeps the table bounded without a background timer.
 * @param database - instance-scoped database handle
 * @param now - injected clock (tests)
 * @returns number of deleted rows
 */
export async function pruneExpiredIndicators(database: Kysely<DB>, now = new Date(),): Promise<number> {
  const result = await database
    .deleteFrom("honeypot_indicators",)
    .where("expires_at", "<=", now.toISOString(),)
    .executeTakeFirst();

  return Number(result?.numDeletedRows ?? 0n,);
}
