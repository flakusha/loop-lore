// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/llm/concurrency-limiter.ts — async semaphore (Effect-backed).
//
// Caps concurrent execution of an async operation. `acquire` resolves once a
// slot is free; `release` returns it. `run` is the convenience wrapper that
// guarantees release even when the callback throws.
//
// ponytail: single-process; no cross-process coordination. Per-provider
// caps live on a `Map<string, ConcurrencyLimiter>` keyed by provider name.

import { Effect, Semaphore, } from "effect";

/**
 * Effect's `SemaphoreImpl` runtime counters (public fields in effect@4, but
 * not part of the `Semaphore` interface). Used only for the `inUse`/`pending`
 * introspection getters so accounting stays coherent across both the manual
 * `acquire` path and the `withPermits`-wrapped `run` path. Pinned by
 * `bun.lock`; any field drift surfaces as a test failure here.
 */
type SemaphoreIntrospection = Semaphore.Semaphore & {
  readonly taken: number;
  readonly waiters: Set<() => void>;
};

/** */
export interface SemaphoreOptions {
  /** Max concurrent holders. Must be >= 1. */
  max: number;
}

/** Async semaphore. */
export class ConcurrencyLimiter {
  private max: number;
  /**
   * Effect Semaphore owns all permit accounting. Abandon safety: `run` wraps
   * the body in `withPermits(1)`, whose release is registered as a fiber exit
   * hook inside the Effect runtime — a body that rejects (even when the caller
   * drops the resulting promise) releases its permit on exit, so an abandoned
   * `run` can never wedge the limiter. `acquire` uses manual
   * `take`/`release`; there the caller remains contract-bound to invoke the
   * releaser exactly once (JS cannot observe a dropped closure), as before.
   */
  private readonly semaphore: SemaphoreIntrospection;

  constructor(opts: SemaphoreOptions,) {
    if (!Number.isInteger(opts.max,) || opts.max < 1) {
      throw new RangeError(`ConcurrencyLimiter: max must be a positive integer, got ${opts.max}`,);
    }

    this.max = opts.max;
    this.semaphore = Semaphore.makeUnsafe(opts.max,) as SemaphoreIntrospection;
  }

  /** Current slots in use. */
  get inUse(): number {
    return this.semaphore.taken;
  }

  /** Configured maximum. */
  get capacity(): number {
    return this.max;
  }

  /** Number of waiters queued. */
  get pending(): number {
    return this.semaphore.waiters.size;
  }

  /**
   * Update the slot cap; wakes parked waiters when raised (hot-reload).
   * @throws {RangeError} when max is not a positive integer.
   */
  resize(max: number,): void {
    if (!Number.isInteger(max,) || max < 1) {
      throw new RangeError(`ConcurrencyLimiter: max must be a positive integer, got ${max}`,);
    }

    const delta = max - this.max;
    this.max = max;
    if (delta > 0) {
      // Release additional permits so parked waiters wake up.
      Effect.runSync(this.semaphore.release(delta,),);
    }
  }

  /**
   * Acquire a slot. Resolves when one is free. `release()` MUST be called by
   * the caller once (use `run` to make this automatic).
   */
  async acquire(): Promise<() => void> {
    await Effect.runPromise(this.semaphore.take(1,),);
    let called = false;
    return () => {
      if (called) { return; }
      called = true;
      // runSync so `inUse` drops synchronously, as the previous
      // hand-rolled releaser did; blocked waiters are woken by Effect.
      Effect.runSync(this.semaphore.release(1,),);
    };
  }

  /**
   * Run `fn` while holding a slot; releases on completion or throw.
   * @param fn
   * @throws whatever `fn` throws.
   */
  async run<T,>(fn: () => Promise<T>,): Promise<T> {
    return Effect.runPromise(
      this.semaphore.withPermits(1,)(
        // `catch` passes the rejection value through unchanged so `runPromise`
        // rejects with the original error, preserving the old contract.
        Effect.tryPromise({ try: fn, catch: (error,) => error, },),
      ),
    );
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
 * @throws {Error}
 * @returns {LimiterRegistry}
 */
export function createLimiterRegistry(): LimiterRegistry {
  const map = new Map<string, ConcurrencyLimiter>();
  return {
    /**
     * @param {string} key
     * @param {number} max
     * @throws {Error}
     * @returns {ConcurrencyLimiter}
     */
    get(key: string, max: number,) {
      const existing = map.get(key,);
      if (existing) {
        // Hot-reload: caps are config-derived and may change between loads,
        // so adopt the latest cap instead of pinning the first one seen.
        existing.resize(max,);
        return existing;
      }

      const created = new ConcurrencyLimiter({ max, },);
      map.set(key, created,);
      return created;
    },
    /**
     * @param {string} key
     * @returns {void}
     */
    drop(key: string,) {
      map.delete(key,);
    },
    get size() {
      return map.size;
    },
  };
}
