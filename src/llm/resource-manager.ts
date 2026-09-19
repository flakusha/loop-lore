// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/llm/resource-manager.ts — per-provider scheduling.
//
// Combines a priority queue with a per-provider concurrency limiter so
// that:
//   1. When a slot is free, the highest-priority waiting request runs.
//   2. When the slot pool is full, requests sit in priority order.
//   3. Cancellation marks the request rejected; the drain skips
//      cancelled entries instead of consuming a slot for them.
//
// The executor is injected so the resource manager doesn't depend on the
// provider registry. Wiring this into the existing `callWithFailover`
// happens at the route/service call site.
//
// ponytail: in-process, no persistence, no fairness across processes.
// Add DB-backed queue + cross-instance coordination when restart-survival
// or multi-node scheduling matters.

import { ConcurrencyLimiter, } from "./concurrency-limiter";
import { createInternalHandle, } from "./internal-handle";
import type { InternalHandle, } from "./internal-handle";
import { PriorityQueue, } from "./priority-queue";
import type {
  QueueEntry,
  ResourceManagerOptions,
  ScheduledRequest,
  ScheduleHandle,
} from "./resource-manager-types";
import { RunningHandles, } from "./running-handles";
export { PriorityLevel, } from "./resource-manager-types";
export type {
  Priority,
  PriorityLevel as PriorityLevelT,
  ResourceManagerOptions,
  ScheduledRequest,
  ScheduleHandle,
  ScheduleState,
} from "./resource-manager-types";

/**
 * Per-provider scheduler: priority queue + concurrency limiter.
 */
export class ResourceManager {
  private readonly defaultMax: number;
  private readonly providerMax: Record<string, number>;
  private readonly limiters = new Map<string, ConcurrencyLimiter>();
  private readonly queues = new Map<string, PriorityQueue<QueueEntry>>();
  /** Per-provider in-flight drain promise (idempotency guard). */
  private readonly drains = new Map<string, Promise<void>>();
  /** Live request ids (queued + running); used for duplicate-id detection. */
  private readonly liveIds = new Set<string>();
  /** Dispatched (acquiring or running) handles, for cancel/forgetProvider. */
  private readonly running = new RunningHandles();

  constructor(opts: ResourceManagerOptions = {},) {
    this.defaultMax = opts.defaultMax ?? 4;
    this.providerMax = opts.providerMax ?? {};
  }

  /**
   * Number of requests currently in flight across all providers.
   * @returns the in-flight request count
   */
  get inFlight(): number {
    let n = 0;
    for (const lim of this.limiters.values()) { n += lim.inUse; }
    return n;
  }

  /**
   * Submit a request. Resolves once the executor finishes.
   * @param req - scheduled request (duplicate ids rejected)
   * @returns the schedule handle
   * @throws when a live request already uses the id
   */
  submit<T,>(req: ScheduledRequest<T>,): ScheduleHandle<T> {
    if (this.liveIds.has(req.id,)) {
      throw new Error(`ResourceManager: duplicate id ${req.id}`,);
    }
    this.liveIds.add(req.id,);
    const handle = createInternalHandle<T>(req,);
    handle.onSettled = () => {
      this.liveIds.delete(req.id,);
    };
    const queue = this.queueFor(req.provider,);
    queue.push({ key: req.priority, handle: handle as InternalHandle<unknown>, },);
    this.kickDrain(req.provider,);
    return handle;
  }

  /**
   * Cancel a queued or in-flight request by id.
   * @param id - request id
   * @param reason - cancellation reason
   * @returns `true` when the request was found and not already cancelled
   */
  cancel(id: string, reason?: string,): boolean {
    for (const queue of this.queues.values()) {
      for (const entry of queue) {
        if (entry.handle.id === id) {
          if (entry.handle.isCancelled()) { return false; }
          entry.handle.cancel(reason ?? "cancelled",);
          return true;
        }
      }
    }
    return this.running.cancelById(id, reason ?? "cancelled",);
  }

  /**
   * Drop the queue + limiter for a provider (e.g. on provider removal).
   * @param provider - provider key
   * @returns void
   */
  forgetProvider(provider: string,): void {
    const queue = this.queues.get(provider,);
    if (queue) {
      for (const entry of queue) {
        entry.handle.cancel("forgotten provider",);
      }
    }
    this.running.cancelAll(provider, "forgotten provider",);
    this.queues.delete(provider,);
    this.limiters.delete(provider,);
    this.drains.delete(provider,);
    this.running.drop(provider,);
  }

  private queueFor(provider: string,): PriorityQueue<QueueEntry> {
    let q = this.queues.get(provider,);
    if (!q) {
      q = new PriorityQueue<QueueEntry>({ compare: (a, b,) => a.key - b.key, },);
      this.queues.set(provider, q,);
    }
    return q;
  }

  private limiterFor(provider: string,): ConcurrencyLimiter {
    let lim = this.limiters.get(provider,);
    if (!lim) {
      const max = this.providerMax[provider] ?? this.defaultMax;
      lim = new ConcurrencyLimiter({ max, },);
      this.limiters.set(provider, lim,);
    }
    return lim;
  }

  /**
   * Start a drain if one isn't already running. Idempotent.
   * @param provider - provider key
   * @returns void
   */
  private kickDrain(provider: string,): void {
    if (this.drains.has(provider,)) { return; }
    const p = this.drainQueue(provider,).finally(() => {
      this.drains.delete(provider,);
    },);
    this.drains.set(provider, p,);
    // Drop any rejection from the background drain promise.
    p.then(noop, noop,);
  }

  /**
   * Drain the queue for `provider`. Each iteration pops the next
   * priority entry; if cancelled it's skipped, otherwise a slot is
   * awaited, `runOne` is dispatched, and the loop re-checks the queue.
   * The loop exits when the queue empties.
   * @param provider - provider key
   * @returns void
   */

  private async drainQueue(provider: string,): Promise<void> {
    const queue = this.queues.get(provider,);
    if (!queue) { return; }
    const limiter = this.limiterFor(provider,);

    while (queue.size > 0) {
      let entry = queue.pop();
      while (entry && entry.handle.isCancelled()) { entry = queue.pop(); }
      if (!entry) { return; }

      const handle = entry.handle;
      // Track from dispatch (not runOne) so forgetProvider/cancel can reach
      // handles parked on limiter.acquire().
      this.running.track(provider, handle,);
      const release = await limiter.acquire();
      // Re-check cancellation after acquiring the slot; if it landed
      // during the await, release and try the next entry.
      if (entry.handle.isCancelled()) {
        this.running.untrack(provider, handle,);
        release();
        continue;
      }
      queueMicrotask(() => {
        this.runOne(handle, release,)
          .catch(noop,)
          .finally(() => {
            this.running.untrack(provider, handle,);
          },);
      },);
    }
  }

  private async runOne<T,>(handle: InternalHandle<T>, release: () => void,): Promise<void> {
    handle.transition("running",);
    // Track whether the handle settled itself (resolve/reject/cancel) or
    // ended in a non-terminal state (still queued/cancelled-before-run).
    // onSettled is fired exactly once when the handle itself settles;
    // runOne must NOT also call it in `finally` or it double-fires and
    // the live-id set drops the same request twice.
    let settled = false;
    try {
      if (!handle.isCancelled()) {
        try {
          const value = await handle.req.run();
          if (!handle.isCancelled()) {
            handle.resolve(value,);
            settled = true;
          }
        } catch (err) {
          handle.reject(err,);
          settled = true;
        }
      }
    } finally {
      if (!settled) { handle.onSettled?.(); }
      release();
      this.kickDrain(handle.req.provider,);
    }
  }
}

function noop(): void {
  // Intentional no-op for swallowed rejections; ESLint flags empty bodies.
  return;
}
