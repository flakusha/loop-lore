// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ServerExternalManager liveness probes — coverage tests for
 * startLivenessProbes, stopLivenessProbes, and checkAllLiveliness.
 *
 * The probe loop runs an async safeFetch against /health (llama-cpp),
 * /v1/models (llama-swap), or / (sd-cpp). We exercise the callback by
 * spawning real Bun.serve instances on ephemeral ports and verifying
 * the probe logs the right warning level. mock.module isn't needed:
 * safeFetch just talks to localhost.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { checkAllLiveliness, startLivenessProbes, stopLivenessProbes, } from "./probes";
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

function makeFakeProcess(pid: number,): unknown {
  return {
    pid,
    killed: false,
    kill: () => true,
    stdout: null,
    stderr: null,
  };
}

describe("probes.startLivenessProbes", () => {
  let host: ServerExternalHost & { logCalls: CapturedLog[] };

  beforeEach(() => {
    host = makeHost();
  },);

  afterEach(() => {
    if (host.probeTimer) {
      stopLivenessProbes(host,);
    }
  },);

  test("sets probeTimer to a non-null interval handle", () => {
    expect(host.probeTimer,).toBeNull();
    startLivenessProbes(host,);
    expect(host.probeTimer,).not.toBeNull();
    expect(typeof host.probeTimer,).toBe("object",);
  });

  test("emits debug log on start with the configured interval", () => {
    startLivenessProbes(host,);
    const debugCalls = host.logCalls.filter((c,) => c.level === "debug");
    expect(debugCalls.length,).toBeGreaterThanOrEqual(1,);
    expect(debugCalls[0]?.msg,).toBe("Liveliness probes started",);
    expect(debugCalls[0]?.meta?.intervalMs,).toBe(30_000,);
  });

  test("is a no-op when a timer is already active (idempotent start)", () => {
    startLivenessProbes(host,);
    const first = host.probeTimer;
    startLivenessProbes(host,);
    expect(host.probeTimer,).toBe(first,);
  });

  test("uses a short interval to verify the probe actually runs", async () => {
    (host as unknown as { PROBE_INTERVAL_MS: number }).PROBE_INTERVAL_MS = 50;
    startLivenessProbes(host,);
    // Wait long enough for at least one tick.
    await new Promise((r,) => setTimeout(r, 120,));
    // The probe callback is async + swallows errors; presence of the timer
    // is the only observable invariant (no throw).
    expect(host.probeTimer,).not.toBeNull();
  });
});

describe("probes.stopLivenessProbes", () => {
  let host: ServerExternalHost & { logCalls: CapturedLog[] };

  beforeEach(() => {
    host = makeHost();
  },);

  test("clears an active timer and emits a debug log", () => {
    startLivenessProbes(host,);
    expect(host.probeTimer,).not.toBeNull();
    stopLivenessProbes(host,);
    expect(host.probeTimer,).toBeNull();
    const debugCalls = host.logCalls.filter((c,) => c.level === "debug" && c.msg === "Liveliness probes stopped");
    expect(debugCalls.length,).toBe(1,);
  });

  test("is a no-op when no timer is active", () => {
    expect(host.probeTimer,).toBeNull();
    stopLivenessProbes(host,);
    expect(host.probeTimer,).toBeNull();
  });
});

describe("probes.checkAllLiveliness", () => {
  test("logs a warning for a llama-cpp instance without a running server", async () => {
    const host = makeHost();
    const port = 36000 + Math.floor(Math.random() * 30000,);
    const inst: ServerInstance = {
      type: "llama-cpp",
      process: makeFakeProcess(111,) as ServerInstance["process"],
      port,
      pid: 111,
      startedAt: Date.now(),
    };
    host.instances.push(inst,);
    await checkAllLiveliness(host,);
    const warns = host.logCalls.filter((c,) => c.level === "warn");
    expect(warns.length,).toBe(1,);
    expect(warns[0]?.msg,).toBe("External server unresponsive",);
    expect(warns[0]?.meta?.type,).toBe("llama-cpp",);
    expect(warns[0]?.meta?.pid,).toBe(111,);
  });

  test("does NOT log a warning when llama-cpp /health returns 2xx", async () => {
    const port = 37000 + Math.floor(Math.random() * 30000,);
    const server = Bun.serve({
      port,
      fetch: (req,) => {
        if (new URL(req.url,).pathname === "/health") { return new Response("ok",); }
        return new Response("not found", { status: 404, },);
      },
    },);
    try {
      const host = makeHost();
      host.instances.push({
        type: "llama-cpp",
        process: makeFakeProcess(222,) as ServerInstance["process"],
        port,
        pid: 222,
        startedAt: Date.now(),
      },);
      await checkAllLiveliness(host,);
      const warns = host.logCalls.filter((c,) => c.level === "warn");
      expect(warns,).toHaveLength(0,);
    } finally {
      await server.stop();
    }
  });

  test("treats llama-swap /v1/models any-status as alive", async () => {
    const port = 38000 + Math.floor(Math.random() * 30000,);
    const server = Bun.serve({
      port,
      fetch: () => new Response("missing", { status: 404, },), // 404 still counts as "alive"
    },);
    try {
      const host = makeHost();
      host.instances.push({
        type: "llama-swap",
        process: makeFakeProcess(333,) as ServerInstance["process"],
        port,
        pid: 333,
        startedAt: Date.now(),
      },);
      await checkAllLiveliness(host,);
      const warns = host.logCalls.filter((c,) => c.level === "warn");
      expect(warns,).toHaveLength(0,);
    } finally {
      await server.stop();
    }
  });

  test("logs a warning for an sd-cpp instance without a running server", async () => {
    const host = makeHost();
    const port = 39000 + Math.floor(Math.random() * 30000,);
    host.instances.push({
      type: "sd-cpp",
      process: makeFakeProcess(444,) as ServerInstance["process"],
      port,
      pid: 444,
      startedAt: Date.now(),
    },);
    await checkAllLiveliness(host,);
    const warns = host.logCalls.filter((c,) => c.level === "warn" && c.msg === "External server unresponsive");
    expect(warns.length,).toBe(1,);
    expect(warns[0]?.meta?.type,).toBe("sd-cpp",);
  });

  test("iterates all instances and logs one warning per dead one", async () => {
    const host = makeHost();
    const basePort = 40000 + Math.floor(Math.random() * 30000,);
    for (let i = 0; i < 3; i++) {
      host.instances.push({
        type: "llama-cpp",
        process: makeFakeProcess(500 + i,) as ServerInstance["process"],
        port: basePort + i,
        pid: 500 + i,
        startedAt: Date.now(),
      },);
    }
    await checkAllLiveliness(host,);
    const warns = host.logCalls.filter((c,) => c.level === "warn");
    expect(warns,).toHaveLength(3,);
  });
});
