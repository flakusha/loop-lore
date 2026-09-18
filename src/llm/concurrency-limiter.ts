// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/llm/concurrency-limiter.ts — async semaphore.
//
// Caps concurrent execution of an async operation. `acquire` resolves once a
// slot is free; `release` returns it. `run` is the convenience wrapper that
// guarantees release even when the callback throws.
//
// ponytail: single-process; no cross-process coordination. Per-provider
// caps live on a `Map<string, ConcurrencyLimiter>` keyed by provider name.

/** */
export interface SemaphoreOptions {
  /** Max concurrent holders. Must be >= 1. */
  max: number;
}

/** Async semaphore. */
export class ConcurrencyLimiter {
  private readonly max: number;
  private held = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(opts: SemaphoreOptions,) {
    if (!Number.isInteger(opts.max,) || opts.max < 1) {
      throw new RangeError(`ConcurrencyLimiter: max must be a positive integer, got ${opts.max}`,);
    }
    this.max = opts.max;
  }

  /** Current slots in use. */
  get inUse(): number {
    return this.held;
  }

  /** Configured maximum. */
  get capacity(): number {
    return this.max;
  }

  /** Number of waiters queued. */
  get pending(): number {
    return this.waiters.length;
  }

  /**
   * Acquire a slot. Resolves when one is free. `release()` MUST be called by
   * the caller once (use `run` to make this automatic).
   */
  async acquire(): Promise<() => void> {
    if (this.held < this.max) {
      this.held++;
      return this.makeReleaser();
    }
    return new Promise<() => void>((resolve,) => {
      this.waiters.push(() => {
        this.held++;
        resolve(this.makeReleaser(),);
      },);
    },);
  }

  /**
   * Run `fn` while holding a slot; releases on completion or throw.
   * @throws whatever `fn` throws.
   */
  async run<T,>(fn: () => Promise<T>,): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private makeReleaser(): () => void {
    let called = false;
    return () => {
      if (called) { return; }
      called = true;
      this.held--;
      const next = this.waiters.shift();
      if (next) { next(); }
    };
  }
}

/** */
export interface LimiterRegistry {
  /** Get or create a limiter for `key`, capped at `max`. */
  get(key: string, max: number,): ConcurrencyLimiter;
  /** Drop a limiter (e.g. on provider removal). */
  drop(key: string,): void;
  /** Number of tracked limiters. */
  readonly size: number;
}

/**
 * Map-backed registry of per-key limiters. Lazy-creates a limiter the first
 * time `get(key, max)` is called for a key.
 */
export function createLimiterRegistry(): LimiterRegistry {
  const map = new Map<string, ConcurrencyLimiter>();
  return {
    get(key: string, max: number,) {
      const existing = map.get(key,);
      if (existing) {
        if (existing.capacity !== max) {
          throw new Error(`ConcurrencyLimiter: capacity mismatch for ${key} (have ${existing.capacity}, want ${max})`,);
        }
        return existing;
      }
      const created = new ConcurrencyLimiter({ max, },);
      map.set(key, created,);
      return created;
    },
    drop(key: string,) {
      map.delete(key,);
    },
    get size() {
      return map.size;
    },
  };
}
