// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ServerExternalManager supervision — miss counting, restart-with-backoff,
 * budget exhaustion, and reset-on-success.
 *
 * Probe / restart / clock are injected so no subprocess or network is needed,
 * except one default-probe integration test against a reserved (dead) port.
 */
import {
  describe,
  expect,
  test,
} from "bun:test";
import {
  restartBackoffMs,
  restartInstance,
  superviseAllLiveliness,
  SUPERVISION_MAX_MISSES,
  SUPERVISION_MAX_RESTARTS,
} from "./supervise";
import type {
  LlamaCppOptions,
  ServerExternalHost,
  ServerInstance,
  SupervisionFatalInfo,
} from "./types";

async function reservePort(): Promise<number> {
  const holder = Bun.serve({ port: 0, fetch: () => new Response("ok",), },);
  const port = holder.port;
  await holder.stop();
  if (port === undefined) { throw new Error("reservePort: kernel did not assign a port",); }
  return port;
}

interface CapturedLog {
  level: string;
  msg: string;
  meta?: Record<string, unknown>;
}

function makeHost(): ServerExternalHost & { logCalls: CapturedLog[]; fatalInfos: SupervisionFatalInfo[] } {
  const logCalls: CapturedLog[] = [];
  const fatalInfos: SupervisionFatalInfo[] = [];
  const log = {
    child: () => log,
    debug: (msg: string, meta?: Record<string, unknown>,) => {
      logCalls.push({ level: "debug", msg, meta, },);
    },
    info: (msg: string, meta?: Record<string, unknown>,) => {
      logCalls.push({ level: "info", msg, meta, },);
    },
    warn: (msg: string, meta?: Record<string, unknown>,) => {
      logCalls.push({ level: "warn", msg, meta, },);
    },
    error: (msg: string, _error?: unknown, meta?: Record<string, unknown>,) => {
      logCalls.push({ level: "error", msg, meta, },);
    },
    fatal: (msg: string, _error?: unknown, meta?: Record<string, unknown>,) => {
      logCalls.push({ level: "fatal", msg, meta, },);
    },
  };

  return {
    log: log as unknown as ServerExternalHost["log"],
    instances: [],
    probeTimer: null,
    PROBE_INTERVAL_MS: 30_000,
    onSupervisionFatal: (info,) => {
      fatalInfos.push(info,);
    },
    logCalls,
    fatalInfos,
  };
}

function makeFakeProcess(pid: number,): unknown {
  return {
    pid,
    killed: false,
    kill: () => true,
    stdout: null,
    stderr: null,
  };
}

function makeInstance(port: number, pid: number, withLaunch = true,): ServerInstance {
  const inst: ServerInstance = {
    type: "llama-cpp",
    process: makeFakeProcess(pid,) as ServerInstance["process"],
    port,
    pid,
    startedAt: Date.now(),
  };

  if (withLaunch) {
    inst.launch = {
      kind: "llama-cpp",
      opts: { port, modelPath: "org/repo:quant", } as LlamaCppOptions,
    };
  }

  return inst;
}

async function deadProbe(_instance: ServerInstance,): Promise<boolean> {
  return false;
}

function countingRestart(result: boolean, calls: { count: number },): (
  host: ServerExternalHost,
  instance: ServerInstance,
) => Promise<boolean> {
  return async (_host, _instance,): Promise<boolean> => {
    calls.count += 1;
    return result;
  };
}

describe("supervise.miss counting", () => {
  test("a miss warns with the consecutive-miss count in structured fields", async () => {
    const host = makeHost();
    host.instances.push(makeInstance(19_011, 111,),);

    await superviseAllLiveliness(host, { probe: deadProbe, },);

    const warns = host.logCalls.filter((c,) => c.level === "warn");
    expect(warns,).toHaveLength(1,);
    expect(warns[0]?.msg,).toBe("External server unresponsive",);
    expect(warns[0]?.meta?.consecutiveMisses,).toBe(1,);
    expect(warns[0]?.meta?.type,).toBe("llama-cpp",);
    expect(host.fatalInfos,).toHaveLength(0,);
  });

  test("default probe reports a dead port as a miss (integration)", async () => {
    const host = makeHost();
    const plain: ServerExternalHost = {
      log: host.log,
      instances: [],
      probeTimer: null,
      PROBE_INTERVAL_MS: 30_000,
    };

    plain.instances.push(makeInstance(await reservePort(), 222,),);

    await superviseAllLiveliness(plain,);

    const warns = host.logCalls.filter((c,) => c.level === "warn");
    expect(warns,).toHaveLength(1,);
    expect(warns[0]?.meta?.consecutiveMisses,).toBe(1,);
  });
});

describe("supervise.restart", () => {
  test("N consecutive misses restart exactly once; success resets the counter", async () => {
    const host = makeHost();
    host.instances.push(makeInstance(19_012, 333,),);
    const calls = { count: 0, };
    const restart = countingRestart(true, calls,);

    for (let i = 0; i < SUPERVISION_MAX_MISSES; i += 1) {
      await superviseAllLiveliness(host, { probe: deadProbe, restart, },);
    }

    expect(calls.count,).toBe(1,);

    // Restart succeeded, so the next miss starts a fresh streak — no 2nd restart.
    await superviseAllLiveliness(host, { probe: deadProbe, restart, },);
    expect(calls.count,).toBe(1,);
    const infos = host.logCalls.filter((c,) => c.level === "info" && c.msg === "External server restarted");
    expect(infos,).toHaveLength(1,);
  });

  test("a failed restart backs off before retrying", async () => {
    const host = makeHost();
    host.instances.push(makeInstance(19_013, 444,),);
    const calls = { count: 0, };
    const restart = countingRestart(false, calls,);
    let now = 1_000_000;

    for (let i = 0; i < SUPERVISION_MAX_MISSES; i += 1) {
      await superviseAllLiveliness(host, { probe: deadProbe, restart, now: () => now, },);
    }

    expect(calls.count,).toBe(1,);

    // Immediate tick: backoff gate holds, no new attempt.
    await superviseAllLiveliness(host, { probe: deadProbe, restart, now: () => now, },);
    expect(calls.count,).toBe(1,);
    const backingOff = host.logCalls.filter((c,) => c.msg === "External server unresponsive (restart backing off)");
    expect(backingOff.length,).toBeGreaterThanOrEqual(1,);

    // Past the window: the retry fires.
    now += 60_000;
    await superviseAllLiveliness(host, { probe: deadProbe, restart, now: () => now, },);
    expect(calls.count,).toBe(2,);
  });

  test("an instance with no launch config is never stop/killed by restart", async () => {
    const host = makeHost();
    host.instances.push(makeInstance(19_014, 555, false,),);

    const restarted = await restartInstance(host, host.instances[0] as ServerInstance,);
    expect(restarted,).toBe(false,);
    // The unrestartable instance is left alone (not stopped/killed).
    expect(host.instances,).toHaveLength(1,);
    const warns = host.logCalls.filter((c,) => c.level === "warn");
    expect(warns.some((c,) => c.msg === "Cannot restart external server: no launch config retained"),).toBe(true,);
  });
});

describe("supervise.backoff", () => {
  test("delay grows exponentially and caps at ~30s", () => {
    expect(restartBackoffMs(1, 0,),).toBe(1_000,);
    expect(restartBackoffMs(2, 0,),).toBe(2_000,);
    expect(restartBackoffMs(3, 0,),).toBe(4_000,);
    expect(restartBackoffMs(5, 0,),).toBe(15_000,);
    expect(restartBackoffMs(99, 1,),).toBe(30_000,);
    expect(restartBackoffMs(99, 0,),).toBe(15_000,);
  });
});

describe("supervise.escalation", () => {
  test("budget exhaustion reports fatal once with structured counts", async () => {
    const host = makeHost();
    host.instances.push(makeInstance(19_015, 666,),);
    const calls = { count: 0, };
    const restart = countingRestart(false, calls,);
    let now = 1_000_000;

    for (let i = 0; i < SUPERVISION_MAX_MISSES + SUPERVISION_MAX_RESTARTS + 2; i += 1) {
      now += 60_000;
      await superviseAllLiveliness(host, { probe: deadProbe, restart, now: () => now, },);
    }

    expect(calls.count,).toBe(SUPERVISION_MAX_RESTARTS,);
    expect(host.fatalInfos,).toHaveLength(1,);
    expect(host.fatalInfos[0]?.type,).toBe("llama-cpp",);
    expect(host.fatalInfos[0]?.restartAttempts,).toBe(SUPERVISION_MAX_RESTARTS,);
    expect(host.fatalInfos[0]?.consecutiveMisses,).toBeGreaterThanOrEqual(SUPERVISION_MAX_MISSES,);
    const fatals = host.logCalls.filter((c,) => c.level === "fatal");
    expect(fatals,).toHaveLength(1,);

    // Suppressed after exhaustion — no repeat fatal spam.
    now += 60_000;
    await superviseAllLiveliness(host, { probe: deadProbe, restart, now: () => now, },);
    expect(host.fatalInfos,).toHaveLength(1,);
    expect(calls.count,).toBe(SUPERVISION_MAX_RESTARTS,);
  });
});

describe("supervise.reset", () => {
  test("a successful probe resets the consecutive-miss streak", async () => {
    const host = makeHost();
    host.instances.push(makeInstance(19_016, 777,),);
    const calls = { count: 0, };
    const restart = countingRestart(true, calls,);
    let up = false;
    const probe = async (_instance: ServerInstance,): Promise<boolean> => up;

    await superviseAllLiveliness(host, { probe, restart, },);
    await superviseAllLiveliness(host, { probe, restart, },);
    up = true;
    await superviseAllLiveliness(host, { probe, restart, },);
    up = false;
    await superviseAllLiveliness(host, { probe, restart, },);
    await superviseAllLiveliness(host, { probe, restart, },);

    // 2 misses + success + 2 misses: never 3-in-a-row, so no restart.
    expect(calls.count,).toBe(0,);
    const warns = host.logCalls.filter((c,) => c.level === "warn" && c.msg === "External server unresponsive");
    expect(warns[warns.length - 1]?.meta?.consecutiveMisses,).toBe(2,);
  });
});
