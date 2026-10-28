// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DB-backed quota storage for assistant entity-access operations.
 *
 * Persistent per-user fixed-window counters in `assistant_quota_usage`
 * (migration 081): the deduction is ONE guarded upsert whose `RETURNING` row
 * appears only when the cost fits, so concurrent deductions cannot overshoot
 * the window limit; an expired window is rolled over lazily by a guarded
 * UPDATE before the upsert. Window semantics match the in-process store in
 * `./storage` exactly (`window_start` re-anchors at the first post-expiry
 * deduction; a window is active while `now - windowStart < windowMs`).
 *
 * The active handle: an explicitly bound one ({@link bindQuotaDb}, tests)
 * or the raw `bun:sqlite` handle behind the current {@link getDatabase}
 * resolution (production + e2e). With no handle available the engine falls
 * back to the in-process store.
 */

import { type Database, } from "bun:sqlite";
import { getSqliteDatabase, } from "../../db/index";

/** Explicitly bound handle (tests); null clears the binding. */
let boundDb: Database | null = null;

/**
 * Bind a raw sqlite handle for quota storage (tests bind an in-memory
 * fixture; production resolves lazily via {@link getSqliteDatabase} instead).
 * @param db - handle to bind, or null to unbind
 */
export function bindQuotaDb(db: Database | null,): void {
  boundDb = db;
}

/**
 * Resolve the storage backend handle WITHOUT materializing anything: an
 * explicitly bound fixture wins; otherwise the handle behind the current
 * getDatabase() resolution, or null (→ in-process storage).
 * @returns the active sqlite handle, or null when quota stays in-process
 */
export function quotaDatabase(): Database | null {
  return boundDb ?? getSqliteDatabase();
}

/** Deduction result row (RETURNING payload). */
interface QuotaUsedRow {
  used_units: number;
}

/** Parameters for {@link consumeQuotaDb} (options-object convention). */
export interface QuotaConsumeDbParams {
  /** Active sqlite handle */
  db: Database;
  /** authenticated caller */
  userId: string;
  /** units the operation consumes */
  cost: number;
  /** current epoch ms (injectable for deterministic tests) */
  now: number;
  /** window length in ms */
  windowMs: number;
  /** units available per user per window */
  limitPerWindow: number;
}

/**
 * Atomically check-and-deduct one user's quota against `assistant_quota_usage`.
 *
 * Two statements, each individually atomic:
 * 1. lazy rollover — resets ONLY an expired window (`window_start + windowMs
 *    <= now`); a concurrent reset is a no-op because the guard re-evaluates
 *    against the already-rolled row.
 * 2. check-and-deduct — a guarded upsert whose WHERE clauses skip BOTH the
 *    fresh insert and the accumulate when the cost would exceed the limit;
 *    `RETURNING` yields a row only when the deduction was applied.
 * @param params - handle, caller, cost, clock, and window settings
 * @returns the remaining units AFTER deduction, or null when the cost does not fit
 */
export function consumeQuotaDb(params: QuotaConsumeDbParams,): number | null {
  const { db, userId, cost, now, windowMs, limitPerWindow, } = params;

  db.run(
    `UPDATE assistant_quota_usage
        SET window_start = ?, used_units = 0
      WHERE user_id = ? AND CAST(window_start AS INTEGER) + ? <= ?`,
    [String(now,), userId, windowMs, now,],
  );

  const row = db
    .query<QuotaUsedRow, (string | number)[]>(
      `INSERT INTO assistant_quota_usage (user_id, window_start, used_units)
         SELECT ?, ?, ? WHERE ? <= ?
         ON CONFLICT (user_id) DO UPDATE
            SET used_units = used_units + excluded.used_units
          WHERE assistant_quota_usage.used_units + excluded.used_units <= ?
         RETURNING used_units`,
    )
    .get(userId, String(now,), cost, cost, limitPerWindow, limitPerWindow,);

  return row === null ? null : limitPerWindow - row.used_units;
}

/**
 * Drop one user's counters from the DB (admin reset/tests).
 * @param db - active sqlite handle
 * @param userId - user whose window is dropped
 */
export function resetQuotaDbUser(db: Database, userId: string,): void {
  db.run("DELETE FROM assistant_quota_usage WHERE user_id = ?", [userId,],);
}

/**
 * Drop ALL counters from the DB (the configure contract: settings changes
 * start every user on a fresh window).
 * @param db - active sqlite handle
 */
export function clearQuotaDb(db: Database,): void {
  db.run("DELETE FROM assistant_quota_usage",);
}
