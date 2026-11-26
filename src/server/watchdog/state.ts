// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Watchdog state machine — pure transitions only (no timers, no spawning).
 *
 * The restart budget and backoff curve come from the external-server
 * supervision module so the watchdog does not grow a second policy. The extra
 * state here is only what a process supervisor needs and that module does not
 * track: a sliding crash window, probe misses, and child uptime.
 */
import {
  restartBackoffMs,
  SUPERVISION_MAX_MISSES,
  SUPERVISION_MAX_RESTARTS,
} from "../../services/server-external-manager/supervise";

/** Sliding window for the crash threshold. */
export const CRASH_WINDOW_MS = 60_000;
/** A child that stays healthy this long earns a full budget reset. */
export const RESET_AFTER_UPTIME_MS = 5 * 60_000;
/** Grace period before a forwarded shutdown becomes SIGKILL. */
export const DEFAULT_GRACE_MS = 30_000;
/** Health-poll cadence. */
export const DEFAULT_PROBE_INTERVAL_MS = 5_000;
/** Health-probe timeout. */
export const DEFAULT_PROBE_TIMEOUT_MS = 2_000;

/** Tunable watchdog policy; defaults reuse the external-server budget. */
export interface WatchdogPolicy {
  windowMs: number;
  resetAfterUptimeMs: number;
  maxRestarts: number;
  maxMisses: number;
  graceMs: number;
  probeIntervalMs: number;
  probeTimeoutMs: number;
}

export const DEFAULT_POLICY: WatchdogPolicy = {
  windowMs: CRASH_WINDOW_MS,
  resetAfterUptimeMs: RESET_AFTER_UPTIME_MS,
  maxRestarts: SUPERVISION_MAX_RESTARTS,
  maxMisses: SUPERVISION_MAX_MISSES,
  graceMs: DEFAULT_GRACE_MS,
  probeIntervalMs: DEFAULT_PROBE_INTERVAL_MS,
  probeTimeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
};

/** Watchdog state. Treat as read-only outside the transition functions. */
export interface WatchdogState {
  /** Crash timestamps (epoch ms, oldest first), pruned to `windowMs`. */
  crashTimes: number[];
  /** Earliest epoch ms the next restart may happen (backoff gate). */
  notBefore: number;
  /** Consecutive failed health probes for the current child. */
  consecutiveMisses: number;
  /** Epoch ms the current child was spawned. */
  startedAt: number;
  /** Terminal: crash threshold reached, no further restarts. */
  stopped: boolean;
}

/** What the supervisor should do after a state transition. */
export type WatchdogDecision =
  | { kind: "restart"; delayMs: number; attempt: number }
  | { kind: "kill"; reason: "probe-misses"; misses: number }
  | { kind: "stop"; reason: "crash-threshold"; crashes: number }
  | { kind: "wait" };

/** Which watchdog fold produced a transition (the exec-log event kind). */
export type WatchdogEventKind = "probe" | "crash";

/**
 * One observed state transition. Exec-log writers persist this verbatim —
 * no second backoff or policy decision is made downstream.
 */
export interface WatchdogTransition {
  event_kind: WatchdogEventKind;
  from: WatchdogState;
  to: WatchdogState;
  decision: WatchdogDecision;
  at: number;
}

/** Injected time sources — keeps tests deterministic (no wall-clock waits). */
export interface WatchdogClock {
  now(): number;
  /** Backoff jitter in [0, 1); the helper scales it to 0.5–1.0. */
  jitter(): number;
}

/** @param now - current epoch ms */
export function createState(now: number,): WatchdogState {
  return { crashTimes: [], notBefore: 0, consecutiveMisses: 0, startedAt: now, stopped: false, };
}

/**
 * Mark a fresh child as current: reset probe misses and start its uptime clock.
 * The crash window is deliberately preserved — uptime alone must not refill a
 * budget spent on earlier crashes.
 * @param state
 * @param now
 */
export function onSpawn(state: WatchdogState, now: number,): WatchdogState {
  return { ...state, startedAt: now, consecutiveMisses: 0, };
}

/**
 * Fold one health probe into the state.
 * @param state
 * @param healthy
 * @param policy
 * @param clock
 */
export function onProbe(
  state: WatchdogState,
  healthy: boolean,
  policy: WatchdogPolicy,
  clock: WatchdogClock,
): { state: WatchdogState; decision: WatchdogDecision } {
  if (state.stopped) {
    return { state, decision: { kind: "wait", }, };
  }

  if (healthy) {
    const sustained = clock.now() - state.startedAt >= policy.resetAfterUptimeMs;
    return {
      state: sustained
        ? { ...state, crashTimes: [], notBefore: 0, consecutiveMisses: 0, }
        : { ...state, consecutiveMisses: 0, },
      decision: { kind: "wait", },
    };
  }

  const consecutiveMisses = state.consecutiveMisses + 1;
  if (consecutiveMisses < policy.maxMisses) {
    return { state: { ...state, consecutiveMisses, }, decision: { kind: "wait", }, };
  }

  return {
    state: { ...state, consecutiveMisses, },
    decision: { kind: "kill", reason: "probe-misses", misses: consecutiveMisses, },
  };
}

/**
 * Fold one child exit into the state: prune the crash window, escalate at the
 * threshold, otherwise schedule a restart with the shared backoff helper.
 * @param state
 * @param policy
 * @param clock
 */
export function onCrash(
  state: WatchdogState,
  policy: WatchdogPolicy,
  clock: WatchdogClock,
): { state: WatchdogState; decision: WatchdogDecision } {
  if (state.stopped) {
    return { state, decision: { kind: "wait", }, };
  }

  const at = clock.now();
  const crashTimes = [...state.crashTimes, at,].filter((time,) => at - time < policy.windowMs);

  if (crashTimes.length >= policy.maxRestarts) {
    return {
      state: { ...state, crashTimes, stopped: true, },
      decision: { kind: "stop", reason: "crash-threshold", crashes: crashTimes.length, },
    };
  }

  // attempt is the 1-based crash count inside the window; jitter/scale live in
  // the shared helper so both supervisors stay on one backoff curve.
  const raw = restartBackoffMs(crashTimes.length, clock.jitter(),);
  const notBefore = Math.max(state.notBefore, at + raw,);
  return {
    state: { ...state, crashTimes, notBefore, consecutiveMisses: 0, },
    decision: { kind: "restart", delayMs: Math.max(0, notBefore - at,), attempt: crashTimes.length, },
  };
}
