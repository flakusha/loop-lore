// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rate-limit state stores (epic-api-rate-limiting).
 *
 * In-memory default matches the current single-process deployment (see
 * src/middleware/rate-limit.ts for the same rationale). ponytail: no
 * SQLite/Redis impl until a multi-process deployment exists — swap this
 * interface then, callers don't change.
 */
import type { TokenBucketState, } from "./algorithms";

/** */
export interface RateLimitStore {
  /** Sliding-window request timestamps for a key. */
  loadWindow(key: string,): number[];
  saveWindow(key: string, timestamps: number[],): void;
  /** Token-bucket state for a key. */
  loadBucket(key: string,): TokenBucketState | undefined;
  saveBucket(key: string, state: TokenBucketState,): void;
  /** Stop timers and drop state (server shutdown / test teardown). */
  destroy(): void;
}

/** */
export class InMemoryRateLimitStore implements RateLimitStore {
  private windows = new Map<string, number[]>();
  private buckets = new Map<string, TokenBucketState>();

  /** */
  loadWindow(key: string,): number[] {
    return this.windows.get(key,) ?? [];
  }

  /** */
  saveWindow(key: string, timestamps: number[],): void {
    this.windows.set(key, timestamps,);
  }

  /** */
  loadBucket(key: string,): TokenBucketState | undefined {
    return this.buckets.get(key,);
  }

  /** */
  saveBucket(key: string, state: TokenBucketState,): void {
    this.buckets.set(key, state,);
  }

  /** */
  destroy(): void {
    this.windows.clear();
    this.buckets.clear();
  }
}
