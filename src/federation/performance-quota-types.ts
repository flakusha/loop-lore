// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/federation/performance-quota-types.ts — the shared vocabulary of the
 * performance-quota slice: the budget an operator sets, the usage snapshot
 * that reports it, and the cell key both are addressed by.
 *
 * Split out so the enforcement guard and the persistence loader can speak
 * about budgets without importing the live counter store.
 */
import { PEER_WORKLOAD_CLASSES, type PeerBudgetMode, type PeerWorkloadClass, } from "../db/enums";

/** Rolling window for both budgets that are expressed "per minute". */
export const QUOTA_MINUTE_MS = 60_000;

/** Closed set for fail-closed validation of a caller-supplied class. */
export const WORKLOAD_CLASS_SET: ReadonlySet<string> = new Set<string>(PEER_WORKLOAD_CLASSES,);

/** Operator-set budget for one `(peer, workloadClass)` cell. */
export interface PerformanceBudget {
  readonly origin: string;
  readonly workloadClass: PeerWorkloadClass;
  /** `advisory` counts and reports; `hard` also refuses. */
  readonly mode: PeerBudgetMode;
  /** In-flight ceiling; null means unlimited. */
  readonly maxConcurrency: number | null;
  /** Waiters allowed past the ceiling before a request is refused; null = never queue. */
  readonly maxQueueDepth: number | null;
  /** Sliding-window request ceiling; null means unlimited. */
  readonly requestsPerMinute: number | null;
  /** ADVISORY token rate. Reported only — never enforced. */
  readonly tokensPerMinute: number | null;
}

/** Everything an operator or the router can observe for one cell. */
export interface PerformanceQuotaUsage {
  /** False when federation quotas are off — every other field is then permissive. */
  readonly enabled: boolean;
  readonly mode: PeerBudgetMode;
  /** Requests currently holding a slot for this cell. */
  readonly inFlight: number;
  readonly maxConcurrency: number | null;
  /** Free slots, or null when unlimited. The router's route-away signal. */
  readonly headroom: number | null;
  readonly requestsRemaining: number | null;
  readonly requestsPerMinute: number | null;
  /** Tokens seen in the current minute; advisory data, past the rate included. */
  readonly tokensUsed: number;
  readonly tokensPerMinute: number | null;
  /** True while a refusal is still inside its `Retry-After` window. */
  readonly excluded: boolean;
  /** Which budget caused the exclusion, so a repeat refusal names the same one. */
  readonly excludedLimit: QuotaLimit | null;
  /** Seconds left on the exclusion; 0 when not excluded. */
  readonly excludedRetryAfterSec: number;
}

/** Which budget refused a request. Named in the response payload and the log line. */
export type QuotaLimit = "max_concurrency" | "requests_per_minute";

/**
 * @param origin
 * @param workloadClass
 * @returns {string}
 */
function quotaCellKey(origin: string, workloadClass: PeerWorkloadClass,): string {
  return `${origin}\u0000${workloadClass}`;
}

export { quotaCellKey, };
