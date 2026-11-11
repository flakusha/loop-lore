// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Video dispatch gate — one running render per local box.
 *
 * The weak local box shares one GPU between local llama.cpp (LLM turns) and
 * ComfyUI (video renders). This gate serializes renders that target the same
 * box so two video renders never compete for that GPU; renders targeting
 * different boxes run concurrently, and external providers bypass the gate
 * with zero added latency.
 *
 * Gate key derivation (used by the gate, the hook, and the logs):
 * the key IS the provider's `localBox` string. A job with providers on
 * several boxes serializes on the FIRST box key only — keep failover
 * candidates for one job on the same box (separate boxes have separate
 * configs, so mixed-box lists should not occur). `localBox` is an explicit
 * operator-declared identity ("this provider shares a GPU with this box"),
 * never a baseUrl heuristic — a LAN-addressed ComfyUI on the same box and a
 * localhost-published ComfyUI with its own GPU mis-classify in both
 * directions under a heuristic. Providers WITHOUT `localBox` are external
 * and never enter the gate.
 *
 * Mechanism: per-key promise-chain mutex (a boring FIFO: each waiter appends
 * to the key's tail promise; no new dependency, no priority inversion
 * surface — FIFO order is the submission order). `ConcurrencyLimiter` was
 * considered and rejected: it is semaphore-shaped for N slots with a
 * registry, while this gate is N=1-per-key with first-come dispatch — the
 * chain is the whole implementation.
 */
import { getChildLogger, } from "../logger";

/** Options for {@link dispatchThroughVideoGate}. */
export interface VideoGateDispatchOptions {
  /** Provider list snapshot carried by the job. */
  providers: Array<{ localBox?: string }>;
  /** Named queue-wait ceiling in ms; a waiter past it fails with 429. */
  queueWaitMs?: number;
  /** Wall clock (tests inject a fake). */
  now?: () => number;
  /** Pre-dispatch runner (tests inject a stub; production passes the engine). */
  run?: () => Promise<void>;
}

/** Named queue-wait ceiling: 5 minutes. Past it the job fails 429. */
export const VIDEO_QUEUE_WAIT_MS = 300_000;

/**
 * Single named pre-dispatch model-rotation hook. The sibling precise-unload
 * ticket owns the unload semantics; this module owns the seam. The sibling
 * registers its implementation via {@link setVideoPreDispatchHook} and the
 * gate calls it with the box key only — never a caller-supplied model id,
 * so no request can steer the hook at another user's model.
 * @param boxKey - the local box about to receive a render
 * @returns {Promise<void>}
 */
export type VideoPreDispatchHook = (boxKey: string,) => Promise<void>;

let preDispatchHook: VideoPreDispatchHook = noopAsync;

/**
 * Register the pre-dispatch hook implementation (the sibling unload ticket
 * calls this once at startup; default is a no-op when nothing hooks in).
 * @param hook - the unload implementation
 * @returns {void}
 */
export function setVideoPreDispatchHook(hook: VideoPreDispatchHook,): void {
  preDispatchHook = hook;
}

/**
 * Reset the hook to its no-op default (tests only).
 * @returns {void}
 */
export function __resetVideoPreDispatchHookForTests(): void {
  preDispatchHook = noopAsync;
  tails.clear();
}

/** Per-box FIFO tail: the promise the next waiter appends to. */
const tails = new Map<string, Promise<void>>();

/** Named no-op: the default pre-dispatch hook (ESLint flags empty bodies). */
async function noopAsync(): Promise<void> {
  // Intentional no-op — the hook runs only when the sibling registers one.
  return;
}

/**
 * Run the pre-dispatch hook for a box. Failure never aborts the render —
 * a hook that throws only logs, and dispatch proceeds.
 * @param boxKey - the local box about to receive a render
 * @returns {Promise<void>}
 */
export async function runVideoPreDispatchHook(boxKey: string,): Promise<void> {
  try {
    await preDispatchHook(boxKey,);
  } catch (error) {
    getChildLogger("video-dispatch-gate",)?.warn("video pre-dispatch hook failed; proceeding", {
      boxKey,
      error: error instanceof Error ? error.message : String(error,),
    },);
  }
}

/**
 * The set of distinct box keys a provider list gates on.
 * @param providers - the job's provider snapshot
 * @returns the distinct non-empty localBox values, in first-seen order
 */
export function videoGateKeys(providers: Array<{ localBox?: string }>,): string[] {
  const keys: string[] = [];
  for (const provider of providers) {
    const key = provider.localBox;
    if (key !== undefined && key !== "" && !keys.includes(key,)) {
      keys.push(key,);
    }
  }

  return keys;
}

/**
 * Dispatch one render through the per-box serial gate. External jobs
 * (no `localBox` anywhere) run `run` immediately with zero added latency.
 * Local jobs wait FIFO per box (one running render per box), run the
 * pre-dispatch hook once admitted, then run `run`. A waiter past
 * `queueWaitMs` throws a 429-coded error instead of running.
 * @param opts - providers, ceiling, clock, and the render to run
 * @throws {Error} with `status` 429 when the queue-wait ceiling passes
 * @returns {Promise<void>}
 */
export async function dispatchThroughVideoGate(opts: VideoGateDispatchOptions,): Promise<void> {
  const {
    providers,
    queueWaitMs = VIDEO_QUEUE_WAIT_MS,
    now = Date.now,
    run = noopAsync,
  } = opts;

  const keys = videoGateKeys(providers,);
  if (keys.length === 0) {
    await run();
    return;
  }

  const key = keys[0]!;
  const enqueuedAt = now();
  const previous = tails.get(key,) ?? Promise.resolve();
  const { promise: mine, resolve: release, } = Promise.withResolvers<void>();
  tails.set(key, mine,);

  await previous;

  if (now() - enqueuedAt > queueWaitMs) {
    if (tails.get(key,) === mine) {
      tails.delete(key,);
    }

    release();

    const error = new Error(`Video queue wait exceeded ${queueWaitMs}ms for box "${key}"`,) as Error & {
      status: number;
    };

    error.status = 429;

    getChildLogger("video-dispatch-gate",)?.warn("video render dropped at queue-wait ceiling", { boxKey: key, },);

    throw error;
  }

  try {
    getChildLogger("video-dispatch-gate",)?.info("video render admitted", { boxKey: key, },);
    await runVideoPreDispatchHook(key,);

    await run();
  } finally {
    if (tails.get(key,) === mine) {
      tails.delete(key,);
    }

    release();
  }
}
