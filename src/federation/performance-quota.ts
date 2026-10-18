// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/federation/performance-quota.ts — the in-process counters behind a
 * per-(peer, workloadClass) performance budget.
 *
 * Counters live HERE, in the RECEIVING process, and are the EXISTING
 * primitives rather than a second implementation of them:
 *
 * - `createRateLimiter` (`src/middleware/rate-limit.ts`) is the sliding
 *   request window; one instance per cell.
 * - `createLimiterRegistry` (`src/llm/concurrency-limiter.ts`) is the
 *   concurrency gate, instantiated per `(peer, class)` instead of per
 *   provider. `limiter.inUse` IS this cell's in-flight count — no numeric copy
 *   of it is kept here.
 * - The token budget is a rolling TOTAL in a different unit from requests, so
 *   it is a plain accumulator rather than a third window type.
 *
 * `src/federation/peer-health.ts` is not a second copy of these numbers: it is
 * the SENDER's view (what this instance dispatched to a peer, feeding the
 * router's `peerLoad().headroom`), while this module is the RECEIVER's
 * authoritative admission accounting. Only the receiving process can reject,
 * so only this module decides.
 *
 * Lifetime consequence, stated rather than hidden: counters reset on restart,
 * so a restarted instance is permissive for one window. The BUDGETS are
 * configuration and survive — they are DB rows (migration 068).
 */
import { type ConcurrencyLimiter, createLimiterRegistry, } from "../llm/concurrency-limiter";
import { createRateLimiter, type RateLimiter, } from "../middleware/rate-limit";
import {
  type PerformanceBudget,
  type PerformanceQuotaUsage,
  QUOTA_MINUTE_MS,
  quotaCellKey,
  type QuotaLimit,
  WORKLOAD_CLASS_SET,
} from "./performance-quota-types";

/** Cells untouched this long are dropped, so the map cannot grow without bound
 * across peer churn. Each dropped cell releases its rate limiter's prune timer. */
const IDLE_TTL_MS = 10 * QUOTA_MINUTE_MS;

interface QuotaCell {
  budget: PerformanceBudget;
  limiter: ConcurrencyLimiter | null;
  requests: RateLimiter | null;
  requestsPerMinute: number | null;
  tokensUsed: number;
  tokensWindowStartMs: number;
  excludedUntilMs: number;
  excludedLimit: QuotaLimit | null;
  /** Null until the cell first serves a request. The idle sweep never drops a
   * cell that has never been used, so a freshly installed budget is not swept
   * out from under its first caller. */
  lastUsedMs: number | null;
}

const cells = new Map<string, QuotaCell>();
const limiters = createLimiterRegistry();
let enabled = false;

/**
 * @param cell
 * @returns {void}
 */
function releaseCell(cell: QuotaCell,): void {
  cell.requests?.destroy();
  cell.requests = null;
  cell.requestsPerMinute = null;
}

/**
 * Bring a cell's limiters in line with its (possibly new) budget. A limit the
 * budget no longer names is released; a CHANGED request rate restarts its
 * window, because a limiter's ceiling is immutable.
 * @param key
 * @param cell
 * @returns {void}
 */
function syncCell(key: string, cell: QuotaCell,): void {
  const { budget, } = cell;

  if (budget.maxConcurrency === null) {
    limiters.drop(key,);
    cell.limiter = null;
  } else if (cell.limiter === null || cell.limiter.capacity !== budget.maxConcurrency) {
    cell.limiter = limiters.get(key, budget.maxConcurrency,);
  }

  const rpm = budget.requestsPerMinute;
  if (rpm === null) {
    releaseCell(cell,);
  } else if (cell.requests === null || cell.requestsPerMinute !== rpm) {
    releaseCell(cell,);
    cell.requests = createRateLimiter({ windowMs: QUOTA_MINUTE_MS, maxRequests: rpm, },);
    cell.requestsPerMinute = rpm;
  }
}

/**
 * Install the operator-set budgets and the on/off switch. Safe to call on
 * every config reload: a cell whose budget survives KEEPS its counters, a cell
 * whose budget disappears is released, a new cell starts at zero.
 * @param settings
 * @returns {void}
 */
export function configurePerformanceQuota(
  settings: { enabled: boolean; budgets: readonly PerformanceBudget[] },
): void {
  enabled = settings.enabled;
  const next = new Map<string, PerformanceBudget>();
  for (const budget of settings.budgets) {
    if (!WORKLOAD_CLASS_SET.has(budget.workloadClass,)) { continue; }
    next.set(quotaCellKey(budget.origin, budget.workloadClass,), budget,);
  }

  for (const [key, cell,] of [...cells,]) {
    const budget = next.get(key,);
    if (budget === undefined) {
      limiters.drop(key,);
      releaseCell(cell,);
      cells.delete(key,);
      continue;
    }

    cell.budget = budget;
    syncCell(key, cell,);
  }

  for (const [key, budget,] of next) {
    if (cells.has(key,)) { continue; }
    const cell: QuotaCell = {
      budget,
      limiter: null,
      requests: null,
      requestsPerMinute: null,
      tokensUsed: 0,
      tokensWindowStartMs: 0,
      excludedUntilMs: 0,
      excludedLimit: null,
      lastUsedMs: null,
    };

    syncCell(key, cell,);
    cells.set(key, cell,);
  }
}

/** True when federation quota enforcement is switched on. */
export function performanceQuotaEnabled(): boolean {
  return enabled;
}

/** The budget for a cell, or null when unset — which means unlimited. */
export function performanceBudget(options: {
  origin: string;
  workloadClass: PerformanceBudget["workloadClass"];
},): PerformanceBudget | null {
  if (!enabled) { return null; }
  return cells.get(quotaCellKey(options.origin, options.workloadClass,),)?.budget ?? null;
}

/**
 * Observable usage for one cell: the router's route-away signal and the admin
 * usage surface. Reads the limiters' own counters; never mints a second copy.
 * @param options
 * @returns {PerformanceQuotaUsage}
 */
export function performanceQuotaUsage(options: {
  origin: string;
  workloadClass: PerformanceBudget["workloadClass"];
  now?: number;
},): PerformanceQuotaUsage {
  const now = options.now ?? Date.now();
  const budget = performanceBudget(options,);
  if (budget === null) { return unlimitedUsage(enabled,); }

  const key = quotaCellKey(options.origin, options.workloadClass,);
  const cell = cells.get(key,);
  const inFlight = cell?.limiter?.inUse ?? 0;
  const maxConcurrency = cell?.limiter?.capacity ?? budget.maxConcurrency;

  return {
    enabled,
    mode: budget.mode,
    inFlight,
    maxConcurrency,
    headroom: maxConcurrency === null ? null : Math.max(0, maxConcurrency - inFlight,),
    requestsRemaining: cell?.requests?.peek(key, now,).remaining ?? null,
    requestsPerMinute: budget.requestsPerMinute,
    tokensUsed: cell === undefined ? 0 : readTokenWindow(cell, now,),
    tokensPerMinute: budget.tokensPerMinute,
    excluded: excludedForMs(cell, now,) > 0,
    excludedLimit: excludedForMs(cell, now,) > 0 ? cell?.excludedLimit ?? null : null,
    excludedRetryAfterSec: Math.ceil(excludedForMs(cell, now,) / 1000,),
  };
}

/**
 * Milliseconds left on a cell's exclusion, 0 when it is not excluded.
 * @param cell
 * @param now
 * @returns {number}
 */
function excludedForMs(cell: QuotaCell | undefined, now: number,): number {
  return Math.max(0, (cell?.excludedUntilMs ?? 0) - now,);
}

/**
 * @param isEnabled
 * @returns {PerformanceQuotaUsage}
 */
function unlimitedUsage(isEnabled: boolean,): PerformanceQuotaUsage {
  return {
    enabled: isEnabled,
    mode: "advisory",
    inFlight: 0,
    maxConcurrency: null,
    headroom: null,
    requestsRemaining: null,
    requestsPerMinute: null,
    tokensUsed: 0,
    tokensPerMinute: null,
    excluded: false,
    excludedLimit: null,
    excludedRetryAfterSec: 0,
  };
}

/**
 * @param cell
 * @param now
 * @returns {number}
 */
function readTokenWindow(cell: QuotaCell, now: number,): number {
  return now - cell.tokensWindowStartMs < QUOTA_MINUTE_MS ? cell.tokensUsed : 0;
}

/**
 * Fold one generation's token count into the ADVISORY token budget. Never
 * refuses — the caller keeps the result either way, because tokens are only
 * known after the generation has already been paid for.
 * @param options
 * @returns {void}
 */
export function recordPeerTokenUsage(options: {
  origin: string;
  workloadClass: PerformanceBudget["workloadClass"];
  tokens: number;
  now?: number;
},): void {
  if (!enabled) { return; }
  const cell = cells.get(quotaCellKey(options.origin, options.workloadClass,),);
  if (cell === undefined || cell.budget.tokensPerMinute === null) { return; }
  const now = options.now ?? Date.now();
  if (now - cell.tokensWindowStartMs >= QUOTA_MINUTE_MS) {
    cell.tokensWindowStartMs = now;
    cell.tokensUsed = 0;
  }

  cell.tokensUsed += Math.max(0, options.tokens,);
  cell.lastUsedMs = now;
}

/**
 * Mark a cell refused for `retryAfterSec` seconds: it is skipped for that window
 * exactly like a peer whose circuit is open.
 * @param options
 * @returns {void}
 */
export function excludePeerQuota(options: {
  origin: string;
  workloadClass: PerformanceBudget["workloadClass"];
  limit: QuotaLimit;
  retryAfterSec: number;
  now?: number;
},): void {
  const now = options.now ?? Date.now();
  const cell = cells.get(quotaCellKey(options.origin, options.workloadClass,),);
  if (cell === undefined) { return; }
  cell.excludedUntilMs = Math.max(cell.excludedUntilMs, now + options.retryAfterSec * 1000,);
  cell.excludedLimit = options.limit;
  cell.lastUsedMs = now;
}

/**
 * Mark a cell freshly used so the idle sweep leaves it alone.
 * @param options
 * @returns {void}
 */
export function touchQuotaCell(options: {
  origin: string;
  workloadClass: PerformanceBudget["workloadClass"];
  now: number;
},): void {
  const cell = cells.get(quotaCellKey(options.origin, options.workloadClass,),);
  if (cell !== undefined) { cell.lastUsedMs = options.now; }
}

/**
 * The cell's concurrency gate. Exposed so the guard acquires against the SAME
 * limiter whose `inUse` is published as the in-flight count; there is
 * deliberately no second counter to keep in step with it.
 * @param options
 * @returns {ConcurrencyLimiter | null}
 */
export function quotaConcurrencyLimiter(options: {
  origin: string;
  workloadClass: PerformanceBudget["workloadClass"];
},): ConcurrencyLimiter | null {
  return cells.get(quotaCellKey(options.origin, options.workloadClass,),)?.limiter ?? null;
}

/**
 * The cell's sliding request window.
 * @param options
 * @returns {RateLimiter | null}
 */
export function quotaRequestLimiter(options: {
  origin: string;
  workloadClass: PerformanceBudget["workloadClass"];
},): RateLimiter | null {
  return cells.get(quotaCellKey(options.origin, options.workloadClass,),)?.requests ?? null;
}

/**
 * The key both of a cell's limiters are addressed by.
 * @param options
 * @returns {string}
 */
export function quotaLimiterKey(options: {
  origin: string;
  workloadClass: PerformanceBudget["workloadClass"];
},): string {
  return quotaCellKey(options.origin, options.workloadClass,);
}

/** Drop cells idle past the TTL. Runs on admission; no timer needed. */
export function sweepIdlePerformanceQuota(now = Date.now(),): number {
  let dropped = 0;
  for (const [key, cell,] of [...cells,]) {
    if (cell.lastUsedMs === null) { continue; }
    if (now - cell.lastUsedMs < IDLE_TTL_MS) { continue; }
    if ((cell.limiter?.inUse ?? 0) > 0) { continue; }
    limiters.drop(key,);
    releaseCell(cell,);
    cells.delete(key,);
    dropped += 1;
  }

  return dropped;
}

/** Number of tracked cells — the map's size, for the churn test. */
export function trackedPerformanceQuotaCells(): number {
  return cells.size;
}

/** Drop every budget and counter. Test isolation, and the restart story. */
export function resetPerformanceQuota(): void {
  for (const key of [...cells.keys(),]) { limiters.drop(key,); }
  for (const cell of cells.values()) { releaseCell(cell,); }
  cells.clear();
  enabled = false;
}

/** Re-exported so a caller of the counter store needs only one import. */
export type {
  PerformanceBudget,
  PerformanceQuotaUsage,
} from "./performance-quota-types";
