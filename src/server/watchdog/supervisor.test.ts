// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { Logger, } from "../../logger";
import { restartBackoffMs, SUPERVISION_MAX_RESTARTS, } from "../../services/server-external-manager/supervise";
import type { WatchdogTransition, } from "./state";
import { createSupervisor, defaultProbe, defaultSpawn, } from "./supervisor";
import type { SupervisedChild, WatchdogAlert, } from "./supervisor";

function makeLogger(): Logger {
  const noop = () => {};
  const logger: Logger = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => logger,
    addTransport: noop,
    setBindings: noop,
    setLevel: noop,
    flush: async () => {},
  };

  return logger;
}

/** A child that has already crashed with `code` — no real process, no wait. */
function deadChild(code: number,): SupervisedChild {
  return {
    pid: code,
    exited: Promise.resolve(code,),
    signal: () => {},
    kill: () => {},
  };
}

const fixedClock = { now: () => 1_000, jitter: () => 0, };

describe("watchdog default seams", () => {
  test("defaultProbe fails closed when no server is listening", async () => {
    const probe = defaultProbe("http://127.0.0.1:1/health/live", 200,);
    expect(await probe(),).toBe(false,);
  });

  test("defaultSpawn starts and reaps a real child", async () => {
    const child = defaultSpawn({ rootDir: import.meta.dir, startPath: "--version", },);
    expect(child.pid,).toBeGreaterThan(0,);
    expect(await child.exited,).toBe(0,);
  });
});

describe("watchdog supervisor", () => {
  test("restarts with the shared backoff and stops at the crash threshold", async () => {
    const delays: number[] = [];
    let spawns = 0;
    const alerts: WatchdogAlert[] = [];
    const supervisor = createSupervisor({
      spawn: () => {
        spawns++;
        return deadChild(1,);
      },
      logger: makeLogger(),
      clock: fixedClock,
      alert: (info,) => {
        alerts.push(info,);
      },
      sleep: async (ms,) => {
        delays.push(ms,);
      },
    },);

    expect(await supervisor.run(),).toBe(1,);
    expect(spawns,).toBe(SUPERVISION_MAX_RESTARTS,);
    expect(alerts,).toHaveLength(1,);
    expect(alerts[0]?.crashes,).toBe(SUPERVISION_MAX_RESTARTS,);

    for (let attempt = 1; attempt < SUPERVISION_MAX_RESTARTS; attempt++) {
      expect(delays,).toContain(restartBackoffMs(attempt, 0,),);
    }
  });

  test("does not spawn a replacement until the current child exits", async () => {
    const exit = Promise.withResolvers<number>();
    let spawns = 0;
    const supervisor = createSupervisor({
      spawn: () => {
        spawns++;
        return spawns === 1
          ? { pid: 1, exited: exit.promise, signal: () => {}, kill: () => {}, }
          : deadChild(1,);
      },
      logger: makeLogger(),
      clock: fixedClock,
      policy: { maxRestarts: 2, },
      sleep: async () => {},
    },);

    const running = supervisor.run();
    expect(spawns,).toBe(1,);
    exit.resolve(1,);
    expect(await running,).toBe(1,);
    expect(spawns,).toBe(2,);
  });

  test("forwards SIGTERM and resolves 0 only after the child exits", async () => {
    const exit = Promise.withResolvers<number>();
    const signals: string[] = [];
    let killed = false;
    const child: SupervisedChild = {
      pid: 7,
      exited: exit.promise,
      signal: (signal,) => {
        signals.push(signal,);
      },
      kill: () => {
        killed = true;
      },
    };

    const supervisor = createSupervisor({
      spawn: () => child,
      logger: makeLogger(),
      policy: { probeIntervalMs: 60_000, graceMs: 60_000, },
      sleep: async () => {},
    },);

    const running = supervisor.run();
    supervisor.stop("SIGTERM",);
    expect(signals,).toEqual(["SIGTERM",],);

    let settled = false;
    void running.then(() => {
      settled = true;
    },);

    await Promise.resolve();
    expect(settled,).toBe(false,);

    exit.resolve(0,);
    expect(await running,).toBe(0,);
    expect(killed,).toBe(false,);
  });

  test("unhealthy probes kill the child and count as a crash", async () => {
    const signals: string[] = [];
    const exit = Promise.withResolvers<number>();
    const first: SupervisedChild = {
      pid: 9,
      exited: exit.promise,
      signal: (signal,) => {
        signals.push(signal,);
        exit.resolve(1,);
      },
      kill: () => {},
    };

    const alerts: WatchdogAlert[] = [];
    const supervisor = createSupervisor({
      spawn: () => first,
      logger: makeLogger(),
      clock: fixedClock,
      policy: { maxRestarts: 1, maxMisses: 2, probeIntervalMs: 60_000, },
      probe: async () => false,
      alert: (info,) => {
        alerts.push(info,);
      },
      sleep: async () => {},
    },);

    expect(await supervisor.run(),).toBe(1,);
    expect(signals,).toEqual(["SIGTERM",],);
    expect(alerts,).toHaveLength(1,);
  });

  test("onTransition observes each crash decision with from/to/at", async () => {
    const transitions: WatchdogTransition[] = [];
    const supervisor = createSupervisor({
      spawn: () => deadChild(1,),
      logger: makeLogger(),
      clock: fixedClock,
      policy: { maxRestarts: 2, },
      sleep: async () => {},
      onTransition: (event,) => {
        transitions.push(event,);
      },
    },);

    expect(await supervisor.run(),).toBe(1,);
    expect(transitions.map((t,) => t.decision.kind),).toEqual(["restart", "stop",],);
    for (const t of transitions) {
      expect(t.event_kind,).toBe("crash",);
      expect(t.at,).toBe(1_000,);
      expect(t.from.stopped,).toBe(false,);
      expect(t.to,).not.toBe(t.from,);
    }

    expect(transitions[1]?.to.stopped,).toBe(true,);
    expect(transitions[1]?.decision,).toMatchObject({
      kind: "stop",
      reason: "crash-threshold",
      crashes: 2,
    },);
  });

  test("onTransition observes probe kills", async () => {
    const exit = Promise.withResolvers<number>();
    const child: SupervisedChild = {
      pid: 9,
      exited: exit.promise,
      signal: () => exit.resolve(1,),
      kill: () => {},
    };

    const transitions: WatchdogTransition[] = [];
    const supervisor = createSupervisor({
      spawn: () => child,
      logger: makeLogger(),
      clock: fixedClock,
      policy: { maxRestarts: 1, maxMisses: 2, probeIntervalMs: 60_000, },
      probe: async () => false,
      sleep: async () => {},
      onTransition: (event,) => {
        transitions.push(event,);
      },
    },);

    expect(await supervisor.run(),).toBe(1,);
    const killed = transitions.find((t,) => t.event_kind === "probe" && t.decision.kind === "kill");
    expect(killed?.decision,).toMatchObject({
      kind: "kill",
      reason: "probe-misses",
      misses: 2,
    },);

    expect(killed?.at,).toBe(1_000,);
  });
});
