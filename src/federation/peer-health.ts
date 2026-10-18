// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/peer-health.ts — per-(peer, class) health + load state.
//
// In-memory, exactly like the provider-health cache it mirrors: every signal
// is re-derivable from the next completed attempt, so a restart costs one
// window rather than correctness.
//
// The circuit is a SECOND `CircuitBreaker` instance keyed by
// `origin\0class` — deliberately not the provider singleton, because tripping
// a vendor's circuit from a peer failure is the conflation the epic forbids.

import { type PeerWorkloadClass, } from "../db/enums";
import { CircuitBreaker, } from "../generation/providers/circuit-breaker";

/** EWMA smoothing factor for observed latency. */
const EWMA_ALPHA = 0.3;

/** Circuit thresholds for peer workloads (tighter than the vendor default). */
const PEER_CIRCUIT_CONFIG = { threshold: 3, baseCooldownMs: 10_000, };

/** One (peer, class) cell. `limit` null = unlimited (headroom is always free). */
interface PeerClassState {
  inFlight: number;
  limit: number | null;
  ewmaLatencyMs: number | null;
}

const states = new Map<string, PeerClassState>();
const breaker = new CircuitBreaker();

/**
 * @param origin
 * @param workloadClass
 * @returns {string}
 */
function cellKey(origin: string, workloadClass: PeerWorkloadClass,): string {
  return `${origin}\u0000${workloadClass}`;
}

/**
 * @param origin
 * @param workloadClass
 * @returns {PeerClassState}
 */
function cell(origin: string, workloadClass: PeerWorkloadClass,): PeerClassState {
  const key = cellKey(origin, workloadClass,);
  let entry = states.get(key,);
  if (entry === undefined) {
    entry = { inFlight: 0, limit: null, ewmaLatencyMs: null, };
    states.set(key, entry,);
  }

  return entry;
}

/** Observable load and latency for one (peer, class). */
export interface PeerLoadSnapshot {
  /** Requests currently in flight against this peer for this class. */
  inFlight: number;
  /** Configured concurrency ceiling, or null when unlimited. */
  maxConcurrency: number | null;
  /** In-flight headroom, or null when unlimited. */
  headroom: number | null;
  /** Observed latency EWMA in ms, or null before the first sample. */
  ewmaLatencyMs: number | null;
}

/** In-flight count, concurrency ceiling and observed latency for one peer/class. */
export function peerLoad(
  options: { origin: string; workloadClass: PeerWorkloadClass },
): PeerLoadSnapshot {
  const entry = cell(options.origin, options.workloadClass,);
  return {
    inFlight: entry.inFlight,
    maxConcurrency: entry.limit,
    headroom: entry.limit === null ? null : Math.max(0, entry.limit - entry.inFlight,),
    ewmaLatencyMs: entry.ewmaLatencyMs,
  };
}

/**
 * Set the concurrency ceiling a peer advertises for a class. `null` means
 * unlimited, which is the epic's default when the budget is unset.
 * @param options
 */
export function configurePeerConcurrency(
  options: { origin: string; workloadClass: PeerWorkloadClass; maxConcurrency: number | null },
): void {
  cell(options.origin, options.workloadClass,).limit = options.maxConcurrency;
}

/**
 * Reserve an in-flight slot. Callers MUST pair this with
 * {@link endPeerAttempt} (or use {@link runPeerAttempt}, which does both).
 * @param options
 */
export function beginPeerAttempt(options: { origin: string; workloadClass: PeerWorkloadClass },): void {
  cell(options.origin, options.workloadClass,).inFlight += 1;
}

/** Release an in-flight slot reserved by {@link beginPeerAttempt}. */
export function endPeerAttempt(options: { origin: string; workloadClass: PeerWorkloadClass },): void {
  const entry = cell(options.origin, options.workloadClass,);
  entry.inFlight = Math.max(0, entry.inFlight - 1,);
}

/**
 * Fold one completed attempt into the latency EWMA and the per-(peer, class)
 * circuit. The first sample seeds the EWMA outright — no division by zero.
 * @param options
 * @param options.origin
 * @param options.workloadClass
 * @param options.ok
 * @param options.latencyMs
 */
export function recordPeerOutcome(
  options: {
    origin: string;
    workloadClass: PeerWorkloadClass;
    ok: boolean;
    latencyMs: number;
  },
): void {
  const key = cellKey(options.origin, options.workloadClass,);
  const entry = cell(options.origin, options.workloadClass,);
  if (typeof options.latencyMs === "number" && Number.isFinite(options.latencyMs,)) {
    entry.ewmaLatencyMs = entry.ewmaLatencyMs === null
      ? options.latencyMs
      : entry.ewmaLatencyMs + EWMA_ALPHA * (options.latencyMs - entry.ewmaLatencyMs);
  }

  breaker.register(key, PEER_CIRCUIT_CONFIG,);
  if (options.ok) {
    breaker.onSuccess(key,);
    return;
  }

  breaker.onFailure(key,);
}

/**
 * Run one peer attempt with slot accounting and outcome recording.
 * The decrement lives in `finally`, so a throwing handler can never leak a
 * slot — a leaked slot permanently shrinks the peer's apparent headroom.
 * @param options
 * @param options.origin
 * @param options.workloadClass
 * @param run The attempt itself.
 * @returns {Promise<T>}
 */
export async function runPeerAttempt<T,>(
  options: { origin: string; workloadClass: PeerWorkloadClass },
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  beginPeerAttempt(options,);
  try {
    const result = await run();
    recordPeerOutcome({ ...options, ok: true, latencyMs: performance.now() - startedAt, },);
    return result;
  } catch (error) {
    recordPeerOutcome({ ...options, ok: false, latencyMs: performance.now() - startedAt, },);
    throw error;
  } finally {
    endPeerAttempt(options,);
  }
}

/**
 * True when the peer's circuit for this class refuses a request. Half-open
 * probes pass (that is how the peer recovers); only a still-cooling open
 * circuit is excluded.
 * @param options
 * @returns {boolean}
 */
export function peerCircuitOpen(
  options: { origin: string; workloadClass: PeerWorkloadClass },
): boolean {
  return !breaker.allowRequest(cellKey(options.origin, options.workloadClass,),);
}

/**
 * Record a health-refresh miss as a circuit failure for every class the peer
 * was expected to serve. Fed by `runResyncPass` (cron) in the routing slice.
 * @param origin
 * @param workloadClasses
 */
export function recordPeerHealthMiss(
  origin: string,
  workloadClasses: readonly PeerWorkloadClass[],
): void {
  for (const workloadClass of workloadClasses) {
    recordPeerOutcome({ origin, workloadClass, ok: false, latencyMs: Number.NaN, },);
  }
}

/** Drop every peer's health + load state. Test isolation. */
export function resetPeerHealth(): void {
  states.clear();
  for (const state of breaker.getAllStates()) { breaker.reset(state.name,); }
}
