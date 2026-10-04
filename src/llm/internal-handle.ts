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
  /** Fire onSettled at most once (settle path + manager drain both nudge). */
  notifySettled(): void;
}

/** Prefix for scheduler cancellation errors (see cancel() below). */
const SCHEDULER_CANCEL_PREFIX = "schedule cancelled: ";

/**
 * Whether `err` is a scheduler cancellation (queued slot cancelled before
 * run) as opposed to a provider failure. Lets dispatch seams tell the two
 * apart without coupling to the message text.
 * @param err
 * @returns true for scheduler cancellations
 */
export function isSchedulerCancel(err: unknown,): boolean {
  return err instanceof Error && err.message.startsWith(SCHEDULER_CANCEL_PREFIX,);
}

/**
 * @param {ScheduledRequest<T>} req
 * @returns {InternalHandle<T>}
 */
export function createInternalHandle<T,>(req: ScheduledRequest<T>,): InternalHandle<T> {
  let state: ScheduleState = "queued";
  let resolveFn: ((value: T,) => void) | null = null;
  let rejectFn: ((err: unknown,) => void) | null = null;
  const result = new Promise<T>((res, rej,) => {
    resolveFn = res;
    rejectFn = rej;
  },);

  // onSettled fires exactly once: cancel() settles via settle() while the
  // manager's runOne() also nudges it in `finally` — without this guard the
  // live-id set drops the same request twice.
  let userOnSettled: (() => void) | undefined;
  let settledFired = false;
  const notifySettled = (): void => {
    if (settledFired) { return; }
    settledFired = true;
    userOnSettled?.();
  };

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
    notifySettled();
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
    /**
     * @param {string} reason
     * @returns {void}
     */
    cancel(reason?: string,) {
      if (state === "complete" || state === "cancelled") { return; }
      settle("cancelled", rejectFn, new Error(`${SCHEDULER_CANCEL_PREFIX}${reason ?? "cancelled"}`,),);
    },
    /**
     * @param {T} value
     * @returns {void}
     */
    resolve(value: T,) {
      settle("complete", resolveFn, value,);
    },
    /**
     * @param {unknown} err
     * @returns {void}
     */
    reject(err: unknown,) {
      settle("complete", rejectFn, err,);
    },
    /**
     * @param {ScheduleState} next
     * @returns {void}
     */
    transition(next: ScheduleState,) {
      if (state === "cancelled" && next !== "cancelled") { return; }
      state = next;
    },
    /**
     * @returns {boolean}
     */
    isCancelled() {
      return state === "cancelled";
    },
    get onSettled(): (() => void) | undefined {
      return userOnSettled;
    },
    set onSettled(fn: (() => void) | undefined,) {
      userOnSettled = fn;
    },
    notifySettled,
  };

  return handle;
}
