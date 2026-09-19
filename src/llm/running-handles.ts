// src/llm/running-handles.ts — in-flight handle tracking for the scheduler.
//
// Tracks handles from dispatch (not run-start) so that cancellation and
// provider forgetting can reach requests parked on limiter acquisition.

import type { InternalHandle, } from "./internal-handle";

/**
 * Per-provider set of dispatched (acquiring or running) handles.
 */
export class RunningHandles {
  readonly #byProvider = new Map<string, Set<InternalHandle<unknown>>>();

  track(provider: string, handle: InternalHandle<unknown>,): void {
    let set = this.#byProvider.get(provider,);
    if (!set) {
      set = new Set<InternalHandle<unknown>>();
      this.#byProvider.set(provider, set,);
    }
    set.add(handle,);
  }

  untrack(provider: string, handle: InternalHandle<unknown>,): void {
    this.#byProvider.get(provider,)?.delete(handle,);
  }

  /** Cancel every dispatched handle of `provider`; returns the handles hit. */
  cancelAll(provider: string, reason: string,): void {
    const set = this.#byProvider.get(provider,);
    if (!set) { return; }
    for (const handle of set) { handle.cancel(reason,); }
  }

  /** Find a dispatched handle by id and cancel it. */
  cancelById(id: string, reason: string,): boolean {
    for (const set of this.#byProvider.values()) {
      for (const handle of set) {
        if (handle.id === id) {
          if (handle.isCancelled()) { return false; }
          handle.cancel(reason,);
          return true;
        }
      }
    }
    return false;
  }

  drop(provider: string,): void {
    this.#byProvider.delete(provider,);
  }
}
