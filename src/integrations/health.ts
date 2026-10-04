// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/health.ts — adapter health tracking + per-protocol
// rate limiting (spec §4.4, §10). Verdicts follow §10 failure modes:
// timeouts escalate degraded → unhealthy across consecutive failures;
// auth expiry, protocol parse failures, and crashes trip unhealthy
// immediately; success recovers. Rate limiting is a token bucket keyed
// per (adapter, target), defaulting per protocol with a per-instance
// override, plus upstream `Retry-After` observance on the 429 path.

/** Failure codes driving health transitions (spec §10). */
export type AdapterFailureCode = "timeout" | "auth_expired" | "protocol" | "crash";

/** Health verdict for a single adapter instance. */
export type AdapterVerdict = "ok" | "degraded" | "unhealthy";

/** Per-adapter health record. */
export interface AdapterHealthStatus {
  /** Adapter name (e.g. "matrix"). */
  name: string;
  /** Current verdict. */
  verdict: AdapterVerdict;
  /** Structured reason when unhealthy (`auth_expired` | `protocol` | `crash`). */
  reason?: AdapterFailureCode;
  /** Clock value of the last verdict transition. */
  lastTransitionAt: number;
  /** Consecutive failures since the last success. */
  consecutiveFailures: number;
}

/** Consecutive timeouts before `degraded` escalates to `unhealthy`. */
const UNHEALTHY_TIMEOUT_STREAK = 2;

/** Dashboard/API summary for one adapter (mirrors providerToSummary). */
export interface AdapterHealthSummary {
  name: string;
  verdict: AdapterVerdict;
  reason?: AdapterFailureCode;
  lastTransitionAt: number;
  consecutiveFailures: number;
  /** True when the adapter may still take traffic (verdict !== "unhealthy"). */
  healthy: boolean;
}

/** Options for {@link createAdapterHealth}. */
export interface AdapterHealthOptions {
  /** Clock injection for deterministic tests; default `Date.now`. */
  now?: () => number;
}

/**
 * Track per-adapter health verdicts (spec §10). `markFailure`/`markSuccess`
 * come from the bridge; `isHealthy` lets auth-channel consumers fall to the
 * next rung (epic-auth-channel-provisioning invariant 7).
 */
export interface AdapterHealth {
  /** All tracked adapters, insertion-ordered. */
  getAll(): AdapterHealthStatus[];
  /** Health record for `name`, or undefined before first observation. */
  get(name: string,): AdapterHealthStatus | undefined;
  /** True unless `name` is unhealthy; unknown adapters count as healthy. */
  isHealthy(name: string,): boolean;
  /** Record a classified failure for `name`. */
  markFailure(name: string, code: AdapterFailureCode,): void;
  /** Record a successful send/receive; resets the failure streak. */
  markSuccess(name: string,): void;
  /** Clear all state (tests). */
  reset(): void;
  /** Serialize every record for the dashboard/API surface. */
  toSummary(): AdapterHealthSummary[];
}

/**
 * Build an adapter health tracker. Timeouts escalate `ok → degraded →
 * unhealthy` across consecutive failures; auth/protocol/crash codes trip
 * `unhealthy` immediately with their reason; success recovers to `ok`.
 * @param options Clock injection for deterministic tests.
 * @returns The health tracker.
 */
export function createAdapterHealth(options: AdapterHealthOptions = {},): AdapterHealth {
  const now = options.now ?? (() => Date.now());
  const state = new Map<string, AdapterHealthStatus>();

  function record(name: string,): AdapterHealthStatus {
    let entry = state.get(name,);
    if (entry === undefined) {
      entry = { name, verdict: "ok", lastTransitionAt: now(), consecutiveFailures: 0, };
      state.set(name, entry,);
    }

    return entry;
  }

  function transition(entry: AdapterHealthStatus, verdict: AdapterVerdict,): void {
    if (entry.verdict === verdict) { return; }
    entry.verdict = verdict;
    entry.lastTransitionAt = now();
  }

  return {
    getAll() {
      return [...state.values(),];
    },
    get(name,) {
      return state.get(name,);
    },
    isHealthy(name,) {
      const entry = state.get(name,);
      return entry === undefined || entry.verdict !== "unhealthy";
    },
    markFailure(name, code,) {
      const entry = record(name,);
      entry.consecutiveFailures++;
      if (code === "timeout") {
        // Spec §10: degraded → unhealthy with backoff on consecutive timeouts.
        if (entry.consecutiveFailures >= UNHEALTHY_TIMEOUT_STREAK) {
          entry.reason = undefined;
          transition(entry, "unhealthy",);
        } else {
          transition(entry, "degraded",);
        }

        return;
      }

      entry.reason = code;
      transition(entry, "unhealthy",);
    },
    markSuccess(name,) {
      const entry = record(name,);
      entry.consecutiveFailures = 0;
      entry.reason = undefined;
      transition(entry, "ok",);
    },
    reset() {
      state.clear();
    },
    toSummary() {
      return this.getAll().map((entry,) => ({
        name: entry.name,
        verdict: entry.verdict,
        reason: entry.reason,
        lastTransitionAt: entry.lastTransitionAt,
        consecutiveFailures: entry.consecutiveFailures,
        healthy: entry.verdict !== "unhealthy",
      }));
    },
  };
}

/**
 * Classify an unknown adapter failure into a §10 code. @throws never.
 * @param cause Thrown cause from an adapter call.
 * @returns The matching failure code (`crash` as fallback).
 */
export function classifyAdapterFailure(cause: unknown,): AdapterFailureCode {
  if (cause instanceof Error) {
    if (/timeout|etimedout|econnaborted/i.test(cause.message,) || cause.name === "TimeoutError") {
      return "timeout";
    }

    const code = (cause as { code?: unknown }).code;
    if (code === "ETIMEDOUT") { return "timeout"; }
    if (code === "EACCES" || code === "EAUTH") { return "auth_expired"; }
    if (/unauthorized|forbidden|\b401\b|\b403\b/i.test(cause.message,)) { return "auth_expired"; }
    if (/parse|malformed|protocol/i.test(cause.message,)) { return "protocol"; }
  }

  return "crash";
}

/** Refill rule for one bucket: burst `capacity` + `refillMs` cadence. */
export interface RateLimitRule {
  capacity: number;
  refillMs: number;
}

/** Options for {@link createAdapterRateLimiter}. */
export interface AdapterRateLimiterOptions {
  /** Per-protocol default rules (spec §4.4: per-protocol global). */
  protocols: Record<string, RateLimitRule>;
  /** Per-adapter-instance overrides; beat the protocol default. */
  perAdapter?: Record<string, RateLimitRule>;
  /** Clock injection for deterministic tests; default `Date.now`. */
  now?: () => number;
}

/** Outcome of {@link AdapterRateLimiter.consume}. */
export type RateLimitConsumeResult =
  | { ok: true }
  | { ok: false; code: "rate_limited"; retryAfterMs: number };

/** Token-bucket limiter keyed per (adapter, target). */
export interface AdapterRateLimiter {
  /** Consume one token for `target` from `adapter` (protocol `protocol`). */
  consume(adapter: string, protocol: string, target: string,): RateLimitConsumeResult;
  /** Honor an upstream `Retry-After` (429): block the bucket for `ms`. */
  observeRetryAfter(adapter: string, protocol: string, target: string, ms: number,): void;
  reset(): void;
}

interface Bucket {
  tokens: number;
  lastRefillAt: number;
  blockedUntil?: number;
}

/** Build a per-(adapter, target) token-bucket limiter (spec §4.4): the
 * per-instance override beats the protocol default; unrated protocols are
 * unlimited.
 * @param options Rule tables + clock injection.
 * @returns The limiter.
 */
export function createAdapterRateLimiter(options: AdapterRateLimiterOptions,): AdapterRateLimiter {
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  function bucketFor(keyed: { adapter: string; target: string; rule: RateLimitRule },): Bucket {
    const { adapter, target, rule, } = keyed;
    const key = `${adapter}\u0000${target}`;
    let bucket = buckets.get(key,);
    if (bucket === undefined) {
      bucket = { tokens: rule.capacity, lastRefillAt: now(), };
      buckets.set(key, bucket,);
    }

    return bucket;
  }

  return {
    consume(adapter, protocol, target,) {
      const rule = options.perAdapter?.[adapter] ?? options.protocols[protocol];
      if (rule === undefined) { return { ok: true, }; }

      const nowMs = now();
      const bucket = bucketFor({ adapter, target, rule, },);
      if (bucket.blockedUntil !== undefined) {
        if (nowMs < bucket.blockedUntil) {
          return { ok: false, code: "rate_limited", retryAfterMs: bucket.blockedUntil - nowMs, };
        }

        bucket.blockedUntil = undefined;
      }

      const elapsed = nowMs - bucket.lastRefillAt;
      bucket.tokens = Math.min(rule.capacity, bucket.tokens + Math.floor(elapsed / rule.refillMs,),);
      bucket.lastRefillAt = nowMs;

      if (bucket.tokens < 1) {
        const nextTokenMs = rule.refillMs - (elapsed % rule.refillMs);
        return { ok: false, code: "rate_limited", retryAfterMs: Math.max(1, nextTokenMs,), };
      }

      bucket.tokens--;
      return { ok: true, };
    },
    observeRetryAfter(adapter, protocol, target, ms,) {
      const rule = options.perAdapter?.[adapter] ?? options.protocols[protocol];
      if (rule === undefined) { return; }
      const bucket = bucketFor({ adapter, target, rule, },);
      bucket.blockedUntil = now() + ms;
    },
    reset() {
      buckets.clear();
    },
  };
}
