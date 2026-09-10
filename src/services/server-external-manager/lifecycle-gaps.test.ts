// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * lifecycle gap coverage: stop dispatch against fake host objects (SIGTERM
 * graceful path, SIGKILL escalation, instance-list filtering), stopAll fan-out,
 * and killAllSync clearing dead pids without throwing.
 *
 * No real processes, no mock.module — hand-rolled fake process objects and
 * nonexistent pids (process.kill throws ESRCH, which the code swallows).
 * Plain describe so the suite fires under test:coverage.
 */
import { describe, expect, test, } from "bun:test";
import { killAllSync, stop, stopAll, } from "./lifecycle";
import type { ServerExternalHost, ServerInstance, } from "./types";

interface CapturedLog {
  level: string;
  msg: string;
  meta?: Record<string, unknown>;
}

function makeHost(): ServerExternalHost & { logCalls: CapturedLog[] } {
  const logCalls: CapturedLog[] = [];
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
    error: (msg: string, meta?: Record<string, unknown>,) => {
      logCalls.push({ level: "error", msg, meta, },);
    },
  };
  return {
    log: log as unknown as ServerExternalHost["log"],
    instances: [],
    probeTimer: null,
    PROBE_INTERVAL_MS: 30_000,
    logCalls,
  };
}

/** Fake process that reports killed=true after the first kill (graceful). */
function makeGracefulProc(pid: number, signals: string[],): unknown {
  const state = { killed: false, };
  return {
    pid,
    get killed(): boolean {
      return state.killed;
    },
    kill: (signal?: string,): boolean => {
      signals.push(signal ?? "",);
      state.killed = true;
      return true;
    },
  };
}

/** Fake process that never reports killed (forces SIGKILL escalation). */
function makeStubbornProc(pid: number, signals: string[],): unknown {
  return {
    pid,
    killed: false,
    kill: (signal?: string,): boolean => {
      signals.push(signal ?? "",);
      return true;
    },
  };
}

function makeInstance(
  port: number,
  proc: unknown,
  type: ServerInstance["type"] = "llama-cpp",
): ServerInstance {
  return {
    type,
    process: proc as ServerInstance["process"],
    port,
    pid: port,
    startedAt: Date.now(),
  };
}

describe("lifecycle stop dispatch", () => {
  test("SIGTERM graceful path removes only the target instance", async () => {
    const host = makeHost();
    const signals: string[] = [];
    const target = makeInstance(9101, makeGracefulProc(9101, signals,),);
    const other = makeInstance(9102, makeGracefulProc(9102, [],), "sd-cpp",);
    host.instances.push(target, other,);

    await stop(host, target,);

    expect(signals,).toEqual(["SIGTERM",]);
    expect(host.instances,).toEqual([other,]);
    expect(host.logCalls.some((c,) => c.level === "info" && c.msg === "Stopping server",),).toBe(true,);
  },);

  test("escalates to SIGKILL when the process ignores SIGTERM", async () => {
    const host = makeHost();
    const signals: string[] = [];
    const target = makeInstance(9111, makeStubbornProc(9111, signals,),);
    host.instances.push(target,);

    await stop(host, target,);

    expect(signals,).toEqual(["SIGTERM", "SIGKILL",]);
    expect(host.instances,).toHaveLength(0,);
  },);
},);

describe("lifecycle stopAll dispatch", () => {
  test("stops every instance and empties the list", async () => {
    const host = makeHost();
    const signals: string[] = [];
    host.instances.push(
      makeInstance(9121, makeGracefulProc(9121, signals,),),
      makeInstance(9122, makeGracefulProc(9122, signals,), "sd-cpp",),
      makeInstance(9123, makeGracefulProc(9123, signals,), "llama-swap",),
    );

    await stopAll(host,);

    expect(signals,).toEqual(["SIGTERM", "SIGTERM", "SIGTERM",]);
    expect(host.instances,).toHaveLength(0,);
    expect(host.logCalls.some((c,) => c.level === "info" && c.msg === "Stopping all managed servers",),).toBe(
      true,
    );
  },);

  test("stopAll on an empty host logs and leaves the list empty", async () => {
    const host = makeHost();
    await stopAll(host,);
    expect(host.instances,).toHaveLength(0,);
  },);
},);

describe("lifecycle killAllSync dispatch", () => {
  test("clears instances without throwing for already-dead pids", () => {
    const host = makeHost();
    // Pids that cannot exist: process.kill throws ESRCH, swallowed by design.
    host.instances.push(
      makeInstance(9131, makeGracefulProc(9131, [],),),
      makeInstance(9132, makeGracefulProc(9132, [],), "sd-cpp",),
    );
    for (const instance of host.instances) {
      instance.pid = 2_100_000_000 + instance.port;
    }

    killAllSync(host,);

    expect(host.instances,).toHaveLength(0,);
  },);

  test("killAllSync on an empty host is a no-op", () => {
    const host = makeHost();
    killAllSync(host,);
    expect(host.instances,).toHaveLength(0,);
  },);
},);
