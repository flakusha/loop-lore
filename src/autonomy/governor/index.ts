// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/governor/index.ts — Autonomy rate governor
//
// Pure module: no scheduler / tick-driver / cron dependency. The gate
// sequence (config resolve → read row → window check → upsert) reads as one
// ordered transaction; the row cache lives in ./cache.ts and cap resolution
// in ./caps.ts so this file stays under the 250-line size gate. Emits
// `governor.budget.exceeded` once per denial, fire-and-forget.
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { record, } from "../../telemetry/service";
import { toDate, } from "../../utils/date";
import { BudgetCache, } from "./cache";
import { capFromConfig, resolveScopeConfig, } from "./caps";
import type {
  AutonomyScope,
  BudgetRow,
  GovernorLimitCatalog,
  GovernorLimitName,
  GovernorResult,
  TryConsumeOptions,
} from "./types";
export type {
  AutonomyScope,
  BudgetRow,
  GovernorLimit,
  GovernorLimitCatalog,
  GovernorLimitName,
  GovernorResult,
  TryConsumeOptions,
} from "./types";

/** Telemetry event type emitted on every cap trip. */
const TELEMETRY_EVENT_TRIPPED = "governor.budget.exceeded";

/** Cache TTL: how long a cached budget row is trusted. Short, so a
 *  missed writer can't keep the cache stale for long.
 *  ponytail: per-process in-memory cache; per-machine consistency
 *  would need Redis/etc. (current single-process deploy).
 */
const DEFAULT_CACHE_TTL_MS = 1000;

/** Fixed catalog of limit definitions. Per-scope caps come from the
 *  resolved `AutonomyConfig` at runtime.
 */
export const LIMIT_CATALOG: GovernorLimitCatalog = {
  per_tick_action: { windowMs: 60_000, cap: null, },
  per_minute_generation: { windowMs: 60_000, cap: null, },
  per_hour_beat_dispatch: { windowMs: 3_600_000, cap: null, },
} as const;

/**
 * Autonomy rate governor.
 *
 * Pure module — instantiate per scheduler / tick-driver / future
 * consumer. NOT a process singleton: each consumer owns its instance
 * (single instance per scheduler is fine; multiple instances across
 * workers read/write the same DB table).
 *
 * @example
 * ```ts
 * const governor = new AutonomyGovernor();
 * const r = await governor.tryConsume(db,
 *   { kind: "actor", id: actorId, },
 *   "per_minute_generation",
 *   { cap: cfg.perAgentCap, chatId, sessionId, });
 * if (!r.ok) { return; }
 * await runGeneration();
 * ```
 */
export class AutonomyGovernor {
  readonly #cache: BudgetCache;

  constructor(opts?: { cacheTtlMs?: number },) {
    this.#cache = new BudgetCache(opts?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,);
  }

  /** Test helper: drop the in-memory cache (no-op on production deploy). */
  resetCache(): void {
    this.#cache.clear();
  }

  /**
   * Attempt to consume one unit of `limitName` for `scope`.
   *
   * Steps:
   *   1. Resolve cap (caller override > scope kind default from config).
   *   2. Read the persisted row (cache → DB fallback).
   *   3. If no row or window expired, treat as fresh (count = 0).
   *   4. Compute nextCount = current + 1. If nextCount > cap → deny,
   *      emit telemetry, do NOT mutate the row (so a denied consume
   *      cannot keep the gate tripped forever).
   *   5. Else: UPSERT the row with window_start_at = nowMs, count = nextCount.
   *      Update cache.
   *
   * @returns Decision + remaining + resetAt. Caller MUST check `ok`.
   */
  async tryConsume(
    db: Kysely<DB>,
    scope: AutonomyScope,
    limitName: GovernorLimitName,
    opts: TryConsumeOptions = {},
  ): Promise<GovernorResult> {
    const limit = LIMIT_CATALOG[limitName];

    const nowMs = opts.nowMs ?? Date.now();
    const nowIso = toDate(nowMs,).toISOString();

    // Step 1: resolve cap (caller override > scope default). When the
    // caller supplies `opts.cap` explicitly we skip the config SELECT —
    // the resolver reads 2–3 rows on every call.
    const cap = opts.cap !== undefined
      ? opts.cap
      : capFromConfig(scope, await resolveScopeConfig(db, { scope, opts, },),);

    // Unbounded: no DB work, no telemetry.
    if (cap === null) {
      return {
        ok: true,
        remaining: Number.MAX_SAFE_INTEGER,
        resetAt: nowMs + limit.windowMs,
        cap: null,
        count: 0,
      };
    }

    // Step 2: read current row.
    const row = await this.#cache.load(db, { scope, limitName, nowMs, },);

    // Step 3: compute effective (start, count). If row absent or window
    // has rolled past, reset to (nowMs, 0).
    let activeStartMs: number;
    let activeCount: number;
    if (row === null) {
      activeStartMs = nowMs;
      activeCount = 0;
    } else {
      const rowStartMs = toDate(row.window_start_at,).getTime();
      const rowResetMs = rowStartMs + limit.windowMs;
      if (nowMs >= rowResetMs) {
        activeStartMs = nowMs;
        activeCount = 0;
      } else {
        activeStartMs = rowStartMs;
        activeCount = row.window_count;
      }
    }

    const resetAtMs = activeStartMs + limit.windowMs;
    const nextCount = activeCount + 1;

    // Step 4: cap check.
    if (nextCount > cap) {
      // Persist NO mutation — denied consume must not advance the counter.
      // Update cache to reflect current (un-mutated) truth so the next
      // tryConsume within TTL doesn't re-read from DB.
      const unchangedRow: BudgetRow = row ?? {
        scope_kind: scope.kind,
        scope_id: scope.id,
        limit_name: limitName,
        window_start_at: nowIso,
        window_count: 0,
        updated_at: nowIso,
      };
      this.#cache.write(scope, limitName, unchangedRow, nowMs,);

      record(db, {
        eventType: TELEMETRY_EVENT_TRIPPED,
        sessionId: opts.sessionId ?? null,
        chatId: opts.chatId ?? null,
        data: {
          scope_kind: scope.kind,
          scope_id: scope.id,
          limit_name: limitName,
          cap,
          window_count: activeCount,
          window_reset_at: toDate(resetAtMs,).toISOString(),
          timestamp: nowIso,
        },
      },).catch((err: unknown,) => {
        getLogger()
          .child({ module: "autonomy.governor", },)
          .warn("Failed to emit governor.budget.exceeded", { error: String(err,), },);
      },);

      return {
        ok: false,
        remaining: 0,
        resetAt: resetAtMs,
        cap,
        count: activeCount,
      };
    }

    // Step 5: upsert the new count. window_start_at stays anchored to
    // activeStartMs — NOT nowMs — so each successful consume does NOT
    // slide the window forward. Only when the previous window expired
    // does activeStartMs = nowMs (a real reset).
    const activeStartIso = toDate(activeStartMs,).toISOString();
    await db
      .insertInto("autonomy_budget",)
      .values({
        scope_kind: scope.kind,
        scope_id: scope.id,
        limit_name: limitName,
        window_start_at: activeStartIso,
        window_count: nextCount,
        updated_at: nowIso,
      },)
      .onConflict((oc,) =>
        oc
          .columns(["scope_kind", "scope_id", "limit_name",],)
          .doUpdateSet({
            window_start_at: activeStartIso,
            window_count: nextCount,
            updated_at: nowIso,
          },)
      )
      .execute();

    const persisted: BudgetRow = {
      scope_kind: scope.kind,
      scope_id: scope.id,
      limit_name: limitName,
      window_start_at: activeStartIso,
      window_count: nextCount,
      updated_at: nowIso,
    };
    this.#cache.write(scope, limitName, persisted, nowMs,);

    return {
      ok: true,
      remaining: cap - nextCount,
      resetAt: resetAtMs,
      cap,
      count: nextCount,
    };
  }
}
