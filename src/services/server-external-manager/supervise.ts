// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 290

/**
 * Supervised liveness for external AI servers (llama.cpp / llama-swap / sd.cpp).
 *
 * The raw ticker in `probes.ts` only warns. This layer adds the policy:
 * per-instance consecutive-miss counters, restart via the existing spawn
 * paths after N misses, jittered exponential backoff between attempts, and
 * terminal exhaustion (fatal log + permanently disabling the instance —
 * never process.exit, which would crash-loop the app because in-memory
 * counters reset on every restart) once the cumulative restart budget is
 * spent. Counters live only in memory; exhaustion lasts for this process.
 *
 * Threat rules: restarts call the existing `start*` dispatchers only —
 * allowlisted binaries resolved by `findBinary`, argv built in code, no
 * shell, no `$PATH` lookup, no secret env passthrough, no operator-scriptable
 * strings. This module introduces none of those.
 */

import { stop, } from "./lifecycle";
import { probeInstance, } from "./probes";
import { startHonkbox, } from "./start-honkbox";
import { startLlamaCpp, startLlamaSwap, } from "./start-llama";
import { startSdCpp, } from "./start-sd";
import type {
  ServerExternalHost,
  ServerInstance,
  SupervisionCounters,
  SupervisionFatalInfo,
} from "./types";

/** Consecutive probe misses before a restart is attempted. */
export const SUPERVISION_MAX_MISSES = 3;

/** Cumulative restart attempts per instance before permanent exhaustion. */
export const SUPERVISION_MAX_RESTARTS = 5;

/** Backoff base: the first retry waits ~1s (jittered). */
export const SUPERVISION_BACKOFF_BASE_MS = 1_000;

/** Backoff cap: retries never wait longer than ~30s (jittered). */
export const SUPERVISION_BACKOFF_CAP_MS = 30_000;

/** Injectable seams for tests (defaults run the real probe / restart / clock). */
export interface SupervisionDeps {
  probe?: (instance: ServerInstance,) => Promise<boolean>;
  restart?: (host: ServerExternalHost, instance: ServerInstance,) => Promise<boolean>;
  now?: () => number;
}

/**
 * Jittered exponential backoff before the nth restart attempt (1-based):
 * ~1s, ~2s, ~4s … capped at ~30s, each scaled by 0.5–1.0.
 * @param attempt
 * @param jitter
 */
export function restartBackoffMs(attempt: number, jitter: number = Math.random(),): number {
  const grown = SUPERVISION_BACKOFF_BASE_MS * 2 ** attempt;
  const capped = Math.min(grown, SUPERVISION_BACKOFF_CAP_MS,);
  return Math.floor(capped * (0.5 + jitter * 0.5),);
}

/**
 * Stable per-instance key for the counters table.
 * @param instance
 */
function supervisionKey(instance: ServerInstance,): string {
  let port: string;
  try {
    port = String(instance.port,);
  } catch {
    port = "unknown";
  }

  return `${instance.type}:${port}`;
}

/**
 * Identity fields for logs and the fatal report (port read defensively).
 * @param instance
 */
function instanceIdentity(instance: ServerInstance,): {
  type: ServerInstance["type"];
  port?: number;
  pid?: number;
} {
  let port: number | undefined;
  try {
    port = instance.port;
  } catch {
    port = undefined;
  }

  return { type: instance.type, port, pid: instance.pid, };
}

/**
 * @param host
 * @param key
 */
function countersFor(host: ServerExternalHost, key: string,): SupervisionCounters {
  let table = host.supervision;
  if (!table) {
    table = new Map();
    host.supervision = table;
  }

  let counters = table.get(key,);
  if (!counters) {
    counters = { misses: 0, restarts: 0, totalRestarts: 0, notBefore: 0, exhausted: false, };
    table.set(key, counters,);
  }

  return counters;
}

/**
 * Terminal escalation: a fatal log plus the `host.onSupervisionFatal` test
 * hook. Never calls process.exit — a dead backend would crash-loop the app,
 * and counters reset on each restart, so the loop would never converge.
 * The caller marks the instance exhausted to stop all further work.
 * @param host
 * @param info
 */
function escalate(host: ServerExternalHost, info: SupervisionFatalInfo,): void {
  host.log.fatal("External server supervision budget exhausted — disabling instance (no process exit)", undefined, {
    ...info,
  },);

  if (host.onSupervisionFatal) {
    host.onSupervisionFatal(info,);
  }
}

/**
 * Stop + re-spawn an instance via the same dispatcher that started it.
 * Returns true when the replacement became ready; never throws.
 * @param host
 * @param instance
 */
export async function restartInstance(
  host: ServerExternalHost,
  instance: ServerInstance,
): Promise<boolean> {
  const launch = instance.launch;
  if (!launch) {
    host.log.warn("Cannot restart external server: no launch config retained", instanceIdentity(instance,),);
    return false;
  }

  try {
    await stop(host, instance,);
  } catch {
    // The old process may already be gone — proceed to re-spawn.
  }

  try {
    let next: ServerInstance | null;
    if (launch.kind === "llama-cpp") {
      next = await startLlamaCpp(host, launch.opts,);
    } else if (launch.kind === "llama-swap") {
      next = await startLlamaSwap(host, launch.opts,);
    } else if (launch.kind === "honkbox") {
      next = await startHonkbox(host, launch.opts,);
    } else {
      next = await startSdCpp(host, launch.opts,);
    }

    return next !== null;
  } catch {
    return false;
  }
}

/**
 * Supervise one instance for a single tick: count the miss, restart past the
 * threshold (gated by backoff), escalate past the budget, reset on success.
 * @param host
 * @param instance
 * @param deps
 */
async function superviseInstance(
  host: ServerExternalHost,
  instance: ServerInstance,
  deps: Required<SupervisionDeps>,
): Promise<void> {
  const identity = instanceIdentity(instance,);
  const counters = countersFor(host, supervisionKey(instance,),);
  if (counters.exhausted) {
    return;
  }

  let alive = false;
  try {
    alive = await deps.probe(instance,);
  } catch {
    alive = false;
  }

  if (alive) {
    counters.misses = 0;
    counters.restarts = 0;
    counters.notBefore = 0;
    // totalRestarts is cumulative — a healthy probe must not refill the budget.
    return;
  }

  counters.misses += 1;

  if (counters.misses < SUPERVISION_MAX_MISSES) {
    host.log.warn("External server unresponsive", {
      ...identity,
      consecutiveMisses: counters.misses,
      restartAttempts: counters.restarts,
    },);

    return;
  }

  if (counters.totalRestarts >= SUPERVISION_MAX_RESTARTS) {
    counters.exhausted = true;
    // Sustained backoff: push the gate out forever; `exhausted` is the hard stop.
    counters.notBefore = Number.POSITIVE_INFINITY;
    const info: SupervisionFatalInfo = {
      ...identity,
      consecutiveMisses: counters.misses,
      restartAttempts: counters.totalRestarts,
    };

    escalate(host, info,);
    return;
  }

  const at = deps.now();
  if (at < counters.notBefore) {
    host.log.warn("External server unresponsive (restart backing off)", {
      ...identity,
      consecutiveMisses: counters.misses,
      restartAttempts: counters.restarts,
      retryInMs: counters.notBefore - at,
    },);

    return;
  }

  counters.restarts += 1;
  counters.totalRestarts += 1;
  counters.notBefore = at + restartBackoffMs(counters.restarts,);
  host.log.error("Restarting unresponsive external server", undefined, {
    ...identity,
    consecutiveMisses: counters.misses,
    restartAttempts: counters.restarts,
  },);

  let restarted = false;
  try {
    restarted = await deps.restart(host, instance,);
  } catch {
    restarted = false;
  }

  if (restarted) {
    counters.misses = 0;
    host.log.info("External server restarted", {
      ...identity,
      restartAttempts: counters.restarts,
    },);
  } else {
    host.log.error("External server restart failed — backing off", undefined, {
      ...identity,
      restartAttempts: counters.restarts,
      retryInMs: counters.notBefore - deps.now(),
    },);
  }
}

/**
 * Run one supervised liveness pass over all managed instances.
 * Never throws: probe / restart failures are counted, logged, escalated.
 * @param host
 * @param deps
 */
export async function superviseAllLiveliness(
  host: ServerExternalHost,
  deps: SupervisionDeps = {},
): Promise<void> {
  const full: Required<SupervisionDeps> = {
    probe: deps.probe ?? probeInstance,
    restart: deps.restart ?? restartInstance,
    now: deps.now ?? Date.now,
  };

  for (const instance of [...host.instances,]) {
    await superviseInstance(host, instance, full,);
  }
}

/**
 * Start periodic supervised health checks on all managed servers.
 * Overlapping ticks are skipped so two async passes can never restart the
 * same instance concurrently.
 * @param host
 * @param deps
 */
export function startSupervisedProbes(
  host: ServerExternalHost,
  deps: SupervisionDeps = {},
): void {
  if (host.probeTimer) { return; }
  let passInFlight = false;
  host.probeTimer = setInterval(() => {
    if (passInFlight) { return; }
    passInFlight = true;
    void (async () => {
      try {
        await superviseAllLiveliness(host, deps,);
      } catch {
        /* supervision pass — non-critical */
      } finally {
        passInFlight = false;
      }
    })();
  }, host.PROBE_INTERVAL_MS,);

  host.log.debug("Liveliness probes started", { intervalMs: host.PROBE_INTERVAL_MS, },);
}
