// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/federation/performance-quota-guard.ts — the single enforcement point a
 * peer-work endpoint calls before it admits any work.
 *
 * The three enforcement verbs are separate and visible here, in the epic's
 * order:
 *
 * 1. ROUTE AWAY — the SENDER's job, not this one. It reads
 *    `performanceQuotaUsage().headroom` / `.excluded` and picks a different
 *    peer. Nothing to enforce on this side.
 * 2. QUEUE — `await` a slot for up to `queueTimeoutMs` while the queue is
 *    under `maxQueueDepth`, then run.
 * 3. REJECT — only when there is nowhere else to go: HTTP 429 with
 *    `Retry-After` and the namespaced `error_code` a peer routes on.
 *
 * Accounting is per RECEIVING process, so a refusal is authoritative the
 * moment it is returned; there is no cross-instance read-modify-write window.
 * The in-flight slot is taken from the limiter BEFORE the work runs and
 * released in a `finally`, so a throwing handler cannot leak a slot and two
 * concurrent requests cannot both read a below-limit count and both admit.
 */
import type { PeerWorkloadClass, } from "../db/enums";
import { type TranslatorFn, } from "../i18n/types";
import { getChildLogger, } from "../logger";
import { rateLimitHeaders, type RateLimitResult, } from "../middleware/rate-limit";
import { ErrorCode, HttpStatus, jsonError, } from "../routes/http-utils";
import {
  excludePeerQuota,
  performanceBudget,
  performanceQuotaEnabled,
  performanceQuotaUsage,
  quotaConcurrencyLimiter,
  quotaLimiterKey,
  quotaRequestLimiter,
  sweepIdlePerformanceQuota,
  touchQuotaCell,
} from "./performance-quota";
import { type QuotaLimit, WORKLOAD_CLASS_SET, } from "./performance-quota-types";

/** Namespaced codes a peer can route on without parsing prose. */
export const FederationQuotaErrorCode = {
  /** A hard budget was hit and there was nowhere to queue. */
  QuotaExceeded: "federation.quota_exceeded",
  /** The peer is unknown, suspended or not workload-trusted — fail closed, never charged. */
  PeerUntrusted: "federation.peer_untrusted",
  /** The requested class is outside the closed set — fail closed, never charged. */
  UnknownWorkloadClass: "federation.unknown_workload_class",
} as const;

/** How long a queued admission waits for a slot when the caller names no timeout. */
export const DEFAULT_QUOTA_QUEUE_TIMEOUT_MS = 5_000;

/** Result of an admission attempt. The wire returns `response` verbatim on refusal. */
export type PeerWorkAdmission<T,> =
  | { readonly admitted: true; readonly value: T; readonly queued: boolean }
  | { readonly admitted: false; readonly response: Response };

/** Everything the guard needs to decide. */
export interface AdmitPeerWorkOptions {
  readonly origin: string;
  readonly workloadClass: PeerWorkloadClass;
  /** Registry-level trust. An untrusted peer is refused and NEVER charged. */
  readonly peerTrusted: boolean;
  /** Per-attempt timeout the caller will give the work; bounds the queue wait. */
  readonly queueTimeoutMs?: number;
  /** Injected clock. Defaults to `Date.now()`; tests pass their own. */
  readonly now?: number;
  /** Localizer for the human-readable half of the refusal body. */
  readonly t?: TranslatorFn;
}

/**
 * @param response
 * @param headers
 * @returns {Response}
 */
function withHeaders(response: Response, headers: Record<string, string>,): Response {
  for (const [name, value,] of Object.entries(headers,)) { response.headers.set(name, value,); }
  return response;
}

/**
 * Build the 429 a peer actually receives: `Retry-After`, the namespaced
 * `error_code`, and the budget that refused. `data` is the machine-readable half
 * of the existing error envelope, so a peer routes on the code, not the prose.
 * @param options
 * @returns {Response}
 */
function quotaRefused(options: {
  origin: string;
  workloadClass: PeerWorkloadClass;
  limit: QuotaLimit;
  retryAfterSec: number;
  window?: RateLimitResult;
  t?: TranslatorFn;
},): Response {
  const retryAfterSec = Math.max(1, Math.ceil(options.retryAfterSec,),);
  getChildLogger("federation-quota",)?.warn("peer work refused by performance budget", {
    origin: options.origin,
    workloadClass: options.workloadClass,
    limit: options.limit,
    retryAfterSec,
  },);

  const response = jsonError({
    message: "errors.federationQuotaExceeded",
    status: HttpStatus.TooManyRequests,
    code: ErrorCode.TooManyRequests,
    t: options.t,
    data: {
      error_code: FederationQuotaErrorCode.QuotaExceeded,
      limit: options.limit,
      workload_class: options.workloadClass,
      retry_after_sec: retryAfterSec,
    },
  },);

  return withHeaders(
    response,
    rateLimitHeaders(
      options.window ?? { allowed: false, limit: retryAfterSec, remaining: 0, resetSec: retryAfterSec, },
      retryAfterSec,
    ),
  );
}

/**
 * Fail-closed refusal for a peer or class that is not admitted at all. Charged
 * to nobody: an untrusted peer must not be able to spend a trusted peer's
 * budget, and an unknown origin must not be free.
 * @param options
 * @returns {Response}
 */
function notAdmittedRefused(options: {
  origin: string;
  workloadClass: PeerWorkloadClass;
  errorCode: string;
  t?: TranslatorFn;
},): Response {
  getChildLogger("federation-quota",)?.warn("peer work refused before budgeting", {
    origin: options.origin,
    workloadClass: options.workloadClass,
    errorCode: options.errorCode,
  },);

  return jsonError({
    message: "errors.federationQuotaExceeded",
    status: HttpStatus.Forbidden,
    code: ErrorCode.Forbidden,
    t: options.t,
    data: { error_code: options.errorCode, workload_class: options.workloadClass, },
  },);
}

/**
 * Take a slot, waiting up to `timeoutMs` if the queue is not full. A wait that
 * times out hands back the permit it eventually receives, so an abandoned
 * acquire can never inflate the in-flight count.
 * @param limiter
 * @param timeoutMs
 * @returns {Promise<(() => void) | null>}
 */
async function acquireWithin(
  limiter: NonNullable<ReturnType<typeof quotaConcurrencyLimiter>>,
  timeoutMs: number,
): Promise<(() => void) | null> {
  const pending = limiter.acquire();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const giveUp = new Promise<null>((resolve,) => {
    timer = setTimeout(() => resolve(null,), timeoutMs,);
  },);

  try {
    const release = await Promise.race([pending, giveUp,],);
    if (release === null) {
      void pending.then((late,) => late()).catch((error: unknown,) => {
        getChildLogger("federation-quota",)?.warn("late permit release failed", { error, },);
      },);
    }

    return release;
  } finally {
    if (timer !== undefined) { clearTimeout(timer,); }
  }
}

/**
 * Decide whether one peer-work request may run, and run it.
 *
 * The wire calls this once, before any work is admitted, and returns the
 * `response` verbatim when `admitted` is false.
 * @param options
 * @param run
 * @returns {Promise<PeerWorkAdmission<T>>}
 */
export async function admitPeerWork<T,>(
  options: AdmitPeerWorkOptions,
  run: () => Promise<T>,
): Promise<PeerWorkAdmission<T>> {
  const now = options.now ?? Date.now();
  const cell = { origin: options.origin, workloadClass: options.workloadClass, };

  sweepIdlePerformanceQuota(now,);

  if (!WORKLOAD_CLASS_SET.has(options.workloadClass,)) {
    return {
      admitted: false,
      response: notAdmittedRefused({
        ...cell,
        errorCode: FederationQuotaErrorCode.UnknownWorkloadClass,
        t: options.t,
      },),
    };
  }

  if (!options.peerTrusted) {
    return {
      admitted: false,
      response: notAdmittedRefused({ ...cell, errorCode: FederationQuotaErrorCode.PeerUntrusted, t: options.t, },),
    };
  }

  const budget = performanceQuotaEnabled() ? performanceBudget(cell,) : null;
  if (budget === null) { return { admitted: true, value: await run(), queued: false, }; }

  touchQuotaCell({ ...cell, now, },);
  if (budget.mode === "advisory") {
    countAdvisory(cell, budget.requestsPerMinute !== null, now,);
    return { admitted: true, value: await run(), queued: false, };
  }

  const usage = performanceQuotaUsage({ ...cell, now, },);
  if (usage.excluded) {
    return {
      admitted: false,
      response: quotaRefused({
        ...cell,
        limit: usage.excludedLimit ?? "max_concurrency",
        retryAfterSec: usage.excludedRetryAfterSec,
        t: options.t,
      },),
    };
  }

  const requests = quotaRequestLimiter(cell,);
  if (requests !== null) {
    const window = requests.consume(quotaLimiterKey(cell,), now,);
    if (!window.allowed) {
      excludePeerQuota({ ...cell, limit: "requests_per_minute", retryAfterSec: window.resetSec, now, },);
      return {
        admitted: false,
        response: quotaRefused({
          ...cell,
          limit: "requests_per_minute",
          retryAfterSec: window.resetSec,
          window,
          t: options.t,
        },),
      };
    }
  }

  const limiter = quotaConcurrencyLimiter(cell,);
  if (limiter === null) { return { admitted: true, value: await run(), queued: false, }; }

  const queueDepth = budget.maxQueueDepth;
  const canQueue = queueDepth !== null && limiter.pending < queueDepth;
  if (limiter.inUse >= limiter.capacity && !canQueue) {
    const retryAfterSec = (options.queueTimeoutMs ?? DEFAULT_QUOTA_QUEUE_TIMEOUT_MS) / 1000;
    excludePeerQuota({ ...cell, limit: "max_concurrency", retryAfterSec, now, },);
    return {
      admitted: false,
      response: quotaRefused({ ...cell, limit: "max_concurrency", retryAfterSec, t: options.t, },),
    };
  }

  const release = await acquireWithin(limiter, options.queueTimeoutMs ?? DEFAULT_QUOTA_QUEUE_TIMEOUT_MS,);
  if (release === null) {
    const retryAfterSec = (options.queueTimeoutMs ?? DEFAULT_QUOTA_QUEUE_TIMEOUT_MS) / 1000;
    excludePeerQuota({ ...cell, limit: "max_concurrency", retryAfterSec, now, },);
    return {
      admitted: false,
      response: quotaRefused({ ...cell, limit: "max_concurrency", retryAfterSec, t: options.t, },),
    };
  }

  try {
    return { admitted: true, value: await run(), queued: limiter.pending > 0, };
  } finally {
    release();
  }
}

/**
 * Count a request against an ADVISORY budget. The count is the point — the
 * result is ignored, because an advisory budget never refuses.
 * @param cell
 * @param hasRequestLimit
 * @param now
 * @returns {void}
 */
function countAdvisory(
  cell: { origin: string; workloadClass: PeerWorkloadClass },
  hasRequestLimit: boolean,
  now: number,
): void {
  if (!hasRequestLimit) { return; }
  quotaRequestLimiter(cell,)?.consume(quotaLimiterKey(cell,), now,);
}
