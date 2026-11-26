// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Process supervisor for the loop-lore server.
 *
 * Spawns the server entrypoint (`src/server/index.ts`) with
 * `LOOP_LORE_WATCHDOG=1` (so the child's uncaught-exception handler does not
 * swallow the crash exit code), captures stdio, polls the existing liveness
 * endpoint, and restarts with the shared external-server backoff/budget.
 * Everything time-sensitive is injectable so unit tests need neither real
 * children nor 60-second waits.
 */
import type { Logger, } from "../../logger";
import { safeFetch, } from "../../utils";

import {
  createState,
  DEFAULT_POLICY,
  onCrash,
  onProbe,
  onSpawn,
} from "./state";
import type {
  WatchdogClock,
  WatchdogDecision,
  WatchdogPolicy,
  WatchdogState,
  WatchdogTransition,
} from "./state";

/** The slice of a spawned child the supervisor needs. */
export interface SupervisedChild {
  readonly pid: number | undefined;
  /** Resolves with the child's exit code. */
  readonly exited: Promise<number>;
  /** Forward a graceful shutdown signal. */
  signal(signal: "SIGTERM" | "SIGINT",): void;
  /** Forced termination after the grace period. */
  kill(): void;
}

/** Emitted once when the crash threshold stops the supervisor. */
export interface WatchdogAlert {
  crashes: number;
  windowMs: number;
  at: number;
}

/** Injectable seams — all optional except `spawn` and `logger`. */
export interface WatchdogDeps {
  spawn: () => SupervisedChild;
  logger: Logger;
  probe?: () => Promise<boolean>;
  sleep?: (ms: number,) => Promise<void>;
  clock?: WatchdogClock;
  policy?: Partial<WatchdogPolicy>;
  alert?: (info: WatchdogAlert,) => void;
  /** Observed state transitions for exec-log ingestion; default no-op. */
  onTransition?: (transition: WatchdogTransition,) => void;
}

export interface Supervisor {
  /** Runs until a clean stop (resolves 0) or crash threshold (resolves 1). */
  run(): Promise<number>;
  /** Begin graceful stop: forward the signal, then SIGKILL after the grace period. */
  stop(signal?: "SIGTERM" | "SIGINT",): void;
}

function defaultSleep(ms: number,): Promise<void> {
  const { promise, resolve, } = Promise.withResolvers<void>();
  setTimeout(resolve, ms,);
  return promise;
}

/** Build a supervisor. No child is spawned until `run()` is called. */
export function createSupervisor(deps: WatchdogDeps,): Supervisor {
  const policy: WatchdogPolicy = { ...DEFAULT_POLICY, ...deps.policy, };
  const now = deps.clock?.now ?? (() => Date.now());
  const jitter = deps.clock?.jitter ?? Math.random;
  const sleep = deps.sleep ?? defaultSleep;
  const probeHealth = deps.probe ?? (async () => true);

  let state: WatchdogState = createState(now(),);
  let child: SupervisedChild | undefined;
  let stopping = false;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  const clearGrace = (): void => {
    if (graceTimer) {
      clearTimeout(graceTimer,);
      graceTimer = null;
    }
  };

  /** Apply a crash transition; returns true when the threshold stopped us. */
  const handleCrash = async (): Promise<boolean> => {
    const from = state;
    const outcome = onCrash(state, policy, { now, jitter, },);
    state = outcome.state;
    const decision: WatchdogDecision = outcome.decision;
    deps.onTransition?.({
      event_kind: "crash",
      from,
      to: state,
      decision,
      at: now(),
    },);

    if (decision.kind === "stop") {
      const info: WatchdogAlert = { crashes: decision.crashes, windowMs: policy.windowMs, at: now(), };
      deps.logger.fatal("Watchdog crash threshold reached — stopping", undefined, { ...info, },);
      deps.alert?.(info,);
      return true;
    }

    if (decision.kind === "restart") {
      deps.logger.warn("Watchdog restarting child", {
        attempt: decision.attempt,
        delayMs: decision.delayMs,
      },);

      await sleep(decision.delayMs,);
      if (stopping) {
        return false;
      }

      child = deps.spawn();
      state = onSpawn(state, now(),);
    }

    return false;
  };

  const stop = (signal: "SIGTERM" | "SIGINT" = "SIGTERM",): void => {
    if (stopping || state.stopped) {
      return;
    }

    stopping = true;
    child?.signal(signal,);
    graceTimer = setTimeout(() => child?.kill(), policy.graceMs,);
  };

  const run = async (): Promise<number> => {
    if (stopping) {
      return 0;
    }

    child = deps.spawn();
    state = onSpawn(state, now(),);
    deps.logger.info("Watchdog spawned server", { pid: child.pid, },);

    try {
      while (!state.stopped && !stopping) {
        const current = child;
        const outcome = await Promise.race([
          current.exited.then((code,) => ({ kind: "exit", code, }) as const),
          sleep(policy.probeIntervalMs,).then(() => ({ kind: "tick", }) as const),
        ],);

        if (outcome.kind === "exit") {
          if (stopping) {
            break;
          }

          deps.logger.warn("Watchdog child exited", { code: outcome.code, pid: current.pid, },);
          if (await handleCrash()) {
            return 1;
          }

          continue;
        }

        let healthy = false;
        try {
          healthy = await probeHealth();
        } catch {
          healthy = false;
        }

        const from = state;
        const probed = onProbe(state, healthy, policy, { now, jitter, },);
        state = probed.state;
        deps.onTransition?.({
          event_kind: "probe",
          from,
          to: state,
          decision: probed.decision,
          at: now(),
        },);

        if (probed.decision.kind !== "kill") {
          continue;
        }

        deps.logger.warn("Watchdog child unhealthy — terminating", {
          misses: probed.decision.misses,
        },);

        current.signal("SIGTERM",);
        graceTimer = setTimeout(() => current.kill(), policy.graceMs,);
        await current.exited;
        clearGrace();
        if (stopping) {
          break;
        }

        if (await handleCrash()) {
          return 1;
        }
      }
    } finally {
      clearGrace();
      if (stopping) {
        // The supervisor must outlive its child on a graceful stop.
        await child?.exited.catch(() => 0);
      }
    }

    return 0;
  };

  return { run, stop, };
}

interface SpawnPaths {
  rootDir: string;
  startPath: string;
  env?: Record<string, string | undefined>;
}

/** Forward a child's piped stream to the supervisor's corresponding stream. */
async function forwardStdio(
  source: ReadableStream<Uint8Array>,
  destination: { write(chunk: Uint8Array,): unknown },
): Promise<void> {
  const reader = source.getReader();
  try {
    while (true) {
      const { done, value, } = await reader.read();
      if (done) {
        return;
      }

      if (value) {
        destination.write(value,);
      }
    }
  } catch {
    // Child exited; the stream closed underneath us.
  }
}

/** Real Bun child factory used by the CLI. */
export function defaultSpawn(paths: SpawnPaths,): SupervisedChild {
  const proc = Bun.spawn([process.execPath, paths.startPath,], {
    cwd: paths.rootDir,
    env: { ...process.env, ...paths.env, LOOP_LORE_WATCHDOG: "1", },
    stdout: "pipe",
    stderr: "pipe",
  },);

  void forwardStdio(proc.stdout, process.stdout,);
  void forwardStdio(proc.stderr, process.stderr,);

  return {
    pid: proc.pid,
    exited: proc.exited,
    signal: (signal,) => proc.kill(signal,),
    kill: () => proc.kill("SIGKILL",),
  };
}

/**
 * Default health probe against the existing `/health/live` route. A 404 means
 * the opt-in route is not mounted, so exit-code monitoring alone is used.
 */
export function defaultProbe(url: string, timeoutMs: number,): () => Promise<boolean> {
  return async () => {
    try {
      const result = await safeFetch(url, { timeout: timeoutMs, parseJson: false, },);
      // A 404 means the opt-in health route is not mounted — rely on exit codes.
      return result.ok || result.status === 404;
    } catch {
      return false;
    }
  };
}
