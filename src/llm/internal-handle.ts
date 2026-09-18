// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/llm/internal-handle.ts — schedule handle factory.
//
// Internal bookkeeping for the scheduler. Owns the `result` promise and
// settle semantics; the `ResourceManager` coordinates via the
// `onSettled` callback to drop a request from the live-id set.

import type { ScheduledRequest, ScheduleHandle, ScheduleState, } from "./resource-manager-types";

/** Extra methods the manager needs but callers should not see. */
export interface InternalHandle<T,> extends ScheduleHandle<T> {
  readonly req: ScheduledRequest<T>;
  resolve(value: T,): void;
  reject(err: unknown,): void;
  transition(state: ScheduleState,): void;
  isCancelled(): boolean;
  /** Invoked once when the request settles (success / fail / cancel). */
  onSettled?: () => void;
}

export function createInternalHandle<T,>(req: ScheduledRequest<T>,): InternalHandle<T> {
  let state: ScheduleState = "queued";
  let resolveFn: ((value: T,) => void) | null = null;
  let rejectFn: ((err: unknown,) => void) | null = null;
  const result = new Promise<T>((res, rej,) => {
    resolveFn = res;
    rejectFn = rej;
  },);

  const settle = (
    next: ScheduleState,
    fn: ((v: unknown,) => void) | ((v: T,) => void) | null,
    value: unknown,
  ): void => {
    if (!fn) { return; }
    if (state === "complete" || state === "cancelled") { return; }
    const r = fn as (v: unknown,) => void;
    resolveFn = null;
    rejectFn = null;
    state = next;
    r(value,);
    handle.onSettled?.();
  };

  const handle: InternalHandle<T> = {
    id: req.id,
    req,
    get result() {
      return result;
    },
    get state() {
      return state;
    },
    cancel(reason?: string,) {
      if (state === "complete" || state === "cancelled") { return; }
      settle("cancelled", rejectFn, new Error(`schedule cancelled: ${reason ?? "cancelled"}`,),);
    },
    resolve(value: T,) {
      settle("complete", resolveFn, value,);
    },
    reject(err: unknown,) {
      settle("complete", rejectFn, err,);
    },
    transition(next: ScheduleState,) {
      if (state === "cancelled" && next !== "cancelled") { return; }
      state = next;
    },
    isCancelled() {
      return state === "cancelled";
    },
  };
  return handle;
}
