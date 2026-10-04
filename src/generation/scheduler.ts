// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/scheduler.ts — LLM scheduler seam.
//
// Routes generation dispatch through the `src/llm` ResourceManager so the
// orphaned scheduling slice becomes reachable. Behavior-preserving: Normal
// priority, high defaultMax (nothing waits until policy tickets move it),
// failover preserved inside `run()`.

import { CancelReason, CancelSource, } from "../db/enums";
import { isSchedulerCancel, PriorityLevel, ResourceManager, } from "../llm";
import type { GenDeps, } from "./auto-gen/deps";
import { GenerationCancelledError, } from "./cancellation-actions/error";
import { callWithFailover, } from "./providers/call-with-failover";
import type {
  ChunkEvent,
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
} from "./providers/types";

/** Idle-policy cap: high enough that nothing waits (policy tickets lower it). */
export const SCHEDULER_DEFAULT_MAX = 32;

let manager: ResourceManager | null = null;

/** Process-wide scheduler (no policy yet — see epic-llm-request-scheduler). */
export function getSchedulerManager(): ResourceManager {
  if (!manager) {
    manager = new ResourceManager({ defaultMax: SCHEDULER_DEFAULT_MAX, },);
  }

  return manager;
}

/** Test seam: swap/reset the process-wide scheduler. */
export function resetSchedulerManager(next?: ResourceManager,): ResourceManager {
  manager = next ?? new ResourceManager({ defaultMax: SCHEDULER_DEFAULT_MAX, },);
  return manager;
}

/** */
export interface ScheduledDispatchOpts {
  /** Stable unique id (attemptId-derived; the manager rejects live duplicates). */
  id: string;
  /** Ordered failover list (primary first, from buildFailoverList). */
  failoverList: { name: string; provider: LLMProvider }[];
  /** Provider request (signal forwarded to the provider + manager cancel). */
  req: GenerateRequest;
  /** Stream chunk handler. */
  handler?: (chunk: ChunkEvent,) => void;
  /** Lower = more urgent; defaults to Normal (no reordering yet). */
  priority?: number;
  /** Override for tests; defaults to the process-wide manager. */
  scheduler?: ResourceManager;
  /** Dispatch impl (test seam; production uses callWithFailover). */
  call?: typeof callWithFailover;
}

/**
 * Dispatch through the scheduler, preserving failover inside the slot.
 * @param opts
 * @throws {GenerationCancelledError} when the request signal aborts.
 * @throws {Error} when every provider fails.
 * @returns {Promise<GenerateResponse>}
 */
export async function scheduledCallWithFailover(opts: ScheduledDispatchOpts,): Promise<GenerateResponse> {
  const {
    id,
    failoverList,
    req,
    handler,
    priority = PriorityLevel.Normal,
    scheduler,
    call = callWithFailover,
  } = opts;

  const mgr = scheduler ?? getSchedulerManager();
  // Architecture: submit() keys on ONE provider string but failover takes an
  // ordered list — key by the PRIMARY name and run the whole failover list
  // inside run(), so fallback attempts never re-queue behind new primaries
  // and per-provider caps track where the request originated.
  const primary = failoverList[0]?.name ?? "default";
  const handle = mgr.submit<GenerateResponse>({
    id,
    provider: primary,
    priority,
    run: () => call(failoverList, req, handler,),
  },);

  const signal = req.signal;
  if (!signal) {
    return handle.result;
  }

  const onAbort = (): void => {
    // Only cancel while still queued: once running, the provider observes
    // the same signal and its own abort error preserves the original detail
    // (mapped below exactly like callWithFailover); cancelling here would
    // mask it with a generic scheduler message.
    if (handle.state === "queued") { mgr.cancel(id, "request aborted",); }
  };

  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener("abort", onAbort, { once: true, },);
  }

  try {
    return await handle.result;
  } catch (err) {
    // A queued (never-started) request aborted before acquiring a slot
    // rejects with the scheduler's generic cancellation error — map it
    // onto the tracker's reason so callers keep seeing cancellation, never
    // a hang or a generic failure. A request already running keeps the
    // provider's own error untouched (it carries the
    // AbortError/GenerationCancelled detail the stream catch persists).
    const queuedCancel = signal.aborted &&
      handle.state === "cancelled" &&
      isSchedulerCancel(err,);

    if (queuedCancel) {
      const reason: unknown = signal.reason;
      if (reason instanceof GenerationCancelledError) {
        throw reason;
      }

      throw new GenerationCancelledError(
        CancelReason.UserCancel,
        CancelSource.User,
        err instanceof Error ? err.message : "request aborted",
        { cause: err, },
      );
    }

    throw err;
  } finally {
    signal.removeEventListener("abort", onAbort,);
  }
}

/**
 * Auto-gen dispatch seam: `d.callWithFailover` runs inside the manager slot
 * (the GenDeps fake keeps working in tests); an injected `dispatch` fake
 * wins for seam tests. Extracted here so `call-llm.ts` stays under the
 * 250L size gate.
 * @param deps
 * @param opts
 * @param opts.id
 * @param opts.failoverList
 * @param opts.scheduler
 * @param opts.dispatch
 * @param opts.req
 * @param opts.handler
 * @returns {Promise<GenerateResponse>}
 */
export function dispatchThroughScheduler(
  deps: Pick<GenDeps, "callWithFailover">,
  opts: {
    id: string;
    failoverList: { name: string; provider: LLMProvider }[];
    scheduler?: ResourceManager;
    dispatch?: typeof scheduledCallWithFailover;
    req: GenerateRequest;
    handler?: (chunk: ChunkEvent,) => void;
  },
): Promise<GenerateResponse> {
  const run = opts.dispatch ?? scheduledCallWithFailover;
  return run({
    id: opts.id,
    failoverList: opts.failoverList,
    req: opts.req,
    ...(opts.handler ? { handler: opts.handler, } : {}),
    call: deps.callWithFailover,
    ...(opts.scheduler ? { scheduler: opts.scheduler, } : {}),
  },);
}
