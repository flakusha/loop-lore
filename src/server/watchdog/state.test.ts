// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  restartBackoffMs,
  SUPERVISION_MAX_MISSES,
  SUPERVISION_MAX_RESTARTS,
} from "../../services/server-external-manager/supervise";
import {
  createState,
  DEFAULT_POLICY,
  onCrash,
  onProbe,
  onSpawn,
} from "./state";
import type { WatchdogClock, WatchdogDecision, WatchdogState, } from "./state";

const at = (now: number,): WatchdogClock => ({ now: () => now, jitter: () => 0, });
const stateAt = (now: number,): WatchdogState => createState(now,);

describe("watchdog state machine", () => {
  test("defaults reuse the external-server budget and miss threshold", () => {
    expect(DEFAULT_POLICY.maxRestarts,).toBe(SUPERVISION_MAX_RESTARTS,);
    expect(DEFAULT_POLICY.maxMisses,).toBe(SUPERVISION_MAX_MISSES,);
  });

  test("first crash schedules a restart with the shared backoff helper", () => {
    const outcome = onCrash(stateAt(1_000,), DEFAULT_POLICY, at(1_000,),);
    expect(outcome.decision,).toEqual({
      kind: "restart",
      attempt: 1,
      delayMs: restartBackoffMs(1, 0,),
    },);

    expect(outcome.state.crashTimes,).toEqual([1_000,],);
  });

  test("stops and alerts at the cumulative crash threshold", () => {
    let state = stateAt(1_000,);
    let last: WatchdogDecision = { kind: "wait", };
    for (let i = 0; i < SUPERVISION_MAX_RESTARTS; i++) {
      const outcome = onCrash(state, DEFAULT_POLICY, at(1_000,),);
      state = outcome.state;
      last = outcome.decision;
    }

    expect(last.kind,).toBe("stop",);
    expect(last,).toMatchObject({ crashes: SUPERVISION_MAX_RESTARTS, },);
    expect(state.stopped,).toBe(true,);
    const after = onCrash(state, DEFAULT_POLICY, at(1_000,),);
    expect(after.decision.kind,).toBe("wait",);
  });

  test("prunes crashes outside the sliding window", () => {
    const state: WatchdogState = {
      ...stateAt(1_000,),
      crashTimes: [1_000, 2_000,],
    };

    const outcome = onCrash(state, DEFAULT_POLICY, at(61_000,),);
    expect(outcome.state.crashTimes,).toEqual([2_000, 61_000,],);
    expect(outcome.decision.kind,).toBe("restart",);
  });

  test("repeated probe misses request a kill; success clears misses", () => {
    let state = stateAt(0,);
    for (let i = 0; i < SUPERVISION_MAX_MISSES - 1; i++) {
      const miss = onProbe(state, false, DEFAULT_POLICY, at(0,),);
      state = miss.state;
      expect(miss.decision.kind,).toBe("wait",);
    }

    const kill = onProbe(state, false, DEFAULT_POLICY, at(0,),);
    expect(kill.decision,).toEqual({
      kind: "kill",
      reason: "probe-misses",
      misses: SUPERVISION_MAX_MISSES,
    },);

    const recovered = onProbe(kill.state, true, DEFAULT_POLICY, at(0,),);
    expect(recovered.state.consecutiveMisses,).toBe(0,);
  });

  test("sustained uptime resets the crash budget but a fresh spawn does not", () => {
    const crashed = onCrash(stateAt(0,), DEFAULT_POLICY, at(1_000,),).state;
    const spawned = onSpawn(crashed, 2_000,);
    expect(spawned.crashTimes,).toEqual([1_000,],);

    const beforeReset = onProbe(spawned, true, DEFAULT_POLICY, at(200_000,),);
    expect(beforeReset.state.crashTimes,).toEqual([1_000,],);

    const reset = onProbe(spawned, true, DEFAULT_POLICY, at(2_000 + 5 * 60_000,),);
    expect(reset.state.crashTimes,).toEqual([],);
    expect(reset.state.notBefore,).toBe(0,);
  });
});
