// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rate-limit state stores (epic-api-rate-limiting).
 *
 * In-memory default matches the current single-process deployment (see
 * src/middleware/rate-limit.ts for the same rationale). ponytail: no
 * SQLite/Redis impl until a multi-process deployment exists — swap this
 * interface then, callers don't change.
 *
 * Eviction (BUG-rate-limit-in-memory-store-never-evicts-idle-keys):
 * stale window timestamps are pruned on access, entries whose window is
 * fully expired are dropped, and a lightweight sweep runs at most once
 * per SWEEP_INTERVAL saves — no timers.
 */
import type { TokenBucketState, } from "./algorithms";

/** Sweep at most once per N saves — constant, no timers. */
const SWEEP_INTERVAL = 1024;

/** Interface for rate limit state storage. */
export interface RateLimitStore {
  /** Sliding-window request timestamps for a key (stale entries pruned). */
  loadWindow(key: string, nowMs: number,): number[];
  /** @param windowMs policy window, used for staleness + eviction. */
  saveWindow(key: string, timestamps: number[], windowMs: number, nowMs: number,): void;
  /** Token-bucket state for a key. */
  loadBucket(key: string,): TokenBucketState | undefined;
  /** @param windowMs policy window, used for staleness + eviction. */
  saveBucket(key: string, state: TokenBucketState, windowMs: number, nowMs: number,): void;
  /** Stop timers and drop state (server shutdown / test teardown). */
  destroy(): void;
}

/** Internal window entry for a key. */
interface WindowEntry {
  timestamps: number[];
  windowMs: number;
  /** Last save time, for idle eviction. */
  lastSaveMs: number;
}

/** Internal bucket entry for a key. */
interface BucketEntry {
  state: TokenBucketState;
  windowMs: number;
  lastSaveMs: number;
}

/** In-memory rate limit store with lazy eviction. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private windows = new Map<string, WindowEntry>();
  private buckets = new Map<string, BucketEntry>();
  private savesSinceSweep = 0;

  /** */
  /**
   * @param {string} key
   * @param {number} nowMs
   * @returns {number[]}
   */
  loadWindow(key: string, nowMs: number,): number[] {
    const entry = this.windows.get(key,);
    if (!entry) { return []; }
    const cutoff = nowMs - entry.windowMs;
    const fresh = entry.timestamps.filter((t,) => t > cutoff);
    if (fresh.length === 0) {
      this.windows.delete(key,);
      return [];
    }
    entry.timestamps = fresh;
    return fresh;
  }

  /** */
  /**
   * @param {string} key
   * @param {number[]} timestamps
   * @param {number} windowMs
   * @param {number} nowMs
   * @returns {void}
   */
  saveWindow(key: string, timestamps: number[], windowMs: number, nowMs: number,): void {
    if (timestamps.length === 0) {
      this.windows.delete(key,);
    } else {
      this.windows.set(key, { timestamps, windowMs, lastSaveMs: nowMs, },);
    }
    this.maybeSweep(nowMs,);
  }

  /** */
  /**
   * @param {string} key
   * @returns {TokenBucketState | undefined}
   */
  loadBucket(key: string,): TokenBucketState | undefined {
    return this.buckets.get(key,)?.state;
  }

  /** */
  /**
   * @param {string} key
   * @param {TokenBucketState} state
   * @param {number} windowMs
   * @param {number} nowMs
   * @returns {void}
   */
  saveBucket(key: string, state: TokenBucketState, windowMs: number, nowMs: number,): void {
    this.buckets.set(key, { state, windowMs, lastSaveMs: nowMs, },);
    this.maybeSweep(nowMs,);
  }

  /** */
  /**
   * @returns {void}
   */
  destroy(): void {
    this.windows.clear();
    this.buckets.clear();
    this.savesSinceSweep = 0;
  }

  /**
   * Drop entries whose window is fully expired (idled past windowMs since
   * the last activity). Runs at most once per SWEEP_INTERVAL saves.
   */
  /**
   * @param {number} nowMs
   * @returns {void}
   */
  private maybeSweep(nowMs: number,): void {
    this.savesSinceSweep += 1;
    if (this.savesSinceSweep < SWEEP_INTERVAL) { return; }
    this.savesSinceSweep = 0;
    for (const [key, entry,] of this.windows) {
      if (nowMs - entry.lastSaveMs > entry.windowMs) { this.windows.delete(key,); }
    }
    for (const [key, entry,] of this.buckets) {
      if (nowMs - entry.lastSaveMs > entry.windowMs) { this.buckets.delete(key,); }
    }
  }
}
