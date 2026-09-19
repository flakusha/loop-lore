// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/llm/resource-manager.ts - per-provider scheduling.
//
// Combines a priority queue with a per-provider concurrency limiter so
// that:
//   1. When a slot is free, the highest-priority waiting request runs.
//   2. When the slot pool is full, requests sit in priority order.
//   3. Cancellation marks the request rejected; the drain skips
//      cancelled entries instead of consuming a slot for them.
//   4. forgetProvider() rejects queued + in-flight awaiters so callers
//      never leak.
//
// ponytail: in-process, no persistence, no fairness across processes.

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
  private readonly drains = new Map<string, Promise<void>>();
  private readonly liveIds = new Set<string>();
  private readonly handles = new Map<string, InternalHandle<unknown>>();

  constructor(opts: ResourceManagerOptions = {},) {
    this.defaultMax = opts.defaultMax ?? 4;
    this.providerMax = opts.providerMax ?? {};
  }

  get inFlight(): number {
    let n = 0;
    for (const lim of this.limiters.values()) { n += lim.inUse; }
    return n;
  }

  submit<T,>(req: ScheduledRequest<T>,): ScheduleHandle<T> {
    if (this.liveIds.has(req.id,)) {
      throw new Error(`ResourceManager: duplicate id ${req.id}`,);
    }
    this.liveIds.add(req.id,);
    const handle = createInternalHandle<T>(req,);
    const internalHandle = handle as InternalHandle<unknown>;
    this.handles.set(req.id, internalHandle,);
    handle.onSettled = () => {
      this.liveIds.delete(req.id,);
      this.handles.delete(req.id,);
    };
    const queue = this.queueFor(req.provider,);
    queue.push({ key: req.priority, handle: internalHandle, },);
    this.kickDrain(req.provider,);
    return handle;
  }

  cancel(id: string, reason?: string,): boolean {
    const handle = this.handles.get(id,);
    if (!handle) { return false; }
    if (handle.isCancelled()) { return false; }
    handle.cancel(reason ?? "cancelled",);
    return true;
  }

  forgetProvider(provider: string,): void {
    const queue = this.queues.get(provider,);
    if (queue) {
      for (const entry of queue) {
        if (!entry.handle.isCancelled()) {
          entry.handle.cancel(`provider forgotten: ${provider}`,);
        }
      }
    }
    for (const handle of this.handles.values()) {
      if (handle.req.provider === provider && !handle.isCancelled()) {
        handle.cancel(`provider forgotten: ${provider}`,);
      }
    }
    this.queues.delete(provider,);
    this.limiters.delete(provider,);
    this.drains.delete(provider,);
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

  private kickDrain(provider: string,): void {
    if (this.drains.has(provider,)) { return; }
    const p = this.drainQueue(provider,).finally(() => {
      this.drains.delete(provider,);
    },);
    this.drains.set(provider, p,);
    p.then(noop, noop,);
  }

  private async drainQueue(provider: string,): Promise<void> {
    const queue = this.queues.get(provider,);
    if (!queue) { return; }
    const limiter = this.limiterFor(provider,);

    while (queue.size > 0) {
      let entry = queue.pop();
      while (entry && entry.handle.isCancelled()) { entry = queue.pop(); }
      if (!entry) { return; }

      const release = await limiter.acquire();
      if (entry.handle.isCancelled()) {
        release();
        continue;
      }
      const handle = entry.handle;
      queueMicrotask(() => {
        this.runOne(handle, release,).then(noop, noop,);
      },);
    }
  }

  private async runOne<T,>(handle: InternalHandle<T>, release: () => void,): Promise<void> {
    handle.transition("running",);
    try {
      if (!handle.isCancelled()) {
        try {
          const value = await handle.req.run();
          if (!handle.isCancelled()) {
            handle.resolve(value,);
            handle.transition("complete",);
          }
        } catch (err) {
          handle.reject(err,);
        }
      }
    } finally {
      handle.onSettled?.();
      release();
      this.kickDrain(handle.req.provider,);
    }
  }
}

function noop(): void {
  // Intentional no-op for swallowed rejections; ESLint flags empty bodies.
  return;
}
