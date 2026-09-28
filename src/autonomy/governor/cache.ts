// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/governor/cache.ts — budget-row read-through cache
//
// The governor reads the same (scope, limit) pair on consecutive beats.
// Caching the row for a short TTL removes a SELECT per consume; the cache
// is invalidated by TTL only (never by the writer), so a missed flush can
// keep a stale count alive for at most `ttlMs`.
//
// ponytail: per-process in-memory cache; a multi-instance deploy would need
// a shared store (Redis/etc.) or a much shorter TTL.

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { AutonomyScope, BudgetRow, GovernorLimitName, } from "./types";

/** Cached row plus the instant its trust expires. */
interface CacheEntry {
  row: BudgetRow;
  expiresAtMs: number;
}

/** Compose the cache key. */
function cacheKey(scope: AutonomyScope, limitName: GovernorLimitName,): string {
  return `${scope.kind}|${scope.id}|${limitName}`;
}

/** Read-through cache over `autonomy_budget` rows. */
export class BudgetCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #ttlMs: number;

  constructor(ttlMs: number,) {
    this.#ttlMs = ttlMs;
  }

  /**
   * Return the row for this scope/limit, or `null` when no row exists.
   * @param db
   * @param root0
   * @param root0.scope
   * @param root0.limitName
   * @param root0.nowMs
   * @returns the budget row, or `null` when unseeded
   */
  async load(
    db: Kysely<DB>,
    { scope, limitName, nowMs, }: { scope: AutonomyScope; limitName: GovernorLimitName; nowMs: number },
  ): Promise<BudgetRow | null> {
    const key = cacheKey(scope, limitName,);
    const cached = this.#entries.get(key,);
    if (cached && cached.expiresAtMs > nowMs) { return cached.row; }

    const row = await db
      .selectFrom("autonomy_budget",)
      .selectAll()
      .where("scope_kind", "=", scope.kind,)
      .where("scope_id", "=", scope.id,)
      .where("limit_name", "=", limitName,)
      .executeTakeFirst();

    if (!row) { return null; }

    const budget: BudgetRow = {
      scope_kind: row.scope_kind as BudgetRow["scope_kind"],
      scope_id: row.scope_id,
      limit_name: row.limit_name as BudgetRow["limit_name"],
      window_start_at: row.window_start_at,
      window_count: row.window_count,
      updated_at: row.updated_at,
    };
    this.write(scope, limitName, budget, nowMs,);
    return budget;
  }

  /**
   * Store a freshly-written row so the next read in this window skips the DB.
   * @param scope
   * @param limitName
   * @param row
   * @param nowMs
   */
  write(
    scope: AutonomyScope,
    limitName: GovernorLimitName,
    row: BudgetRow,
    nowMs: number,
  ): void {
    this.#entries.set(cacheKey(scope, limitName,), {
      row,
      expiresAtMs: nowMs + this.#ttlMs,
    },);
  }

  /** Drop every entry — used when a budget row is reset out of band. */
  clear(): void {
    this.#entries.clear();
  }
}
