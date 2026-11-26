// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Supervision gap coverage — exports the main suite never executes:
 * backoff constants, the real probeInstance against a dead port, and
 * startSupervisedProbes timer registration. No network or subprocess.
 */
import {
  describe,
  expect,
  test,
} from "bun:test";
import { probeInstance, } from "./probes";
import {
  startSupervisedProbes,
  SUPERVISION_BACKOFF_BASE_MS,
  SUPERVISION_BACKOFF_CAP_MS,
} from "./supervise";
import type {
  ServerExternalHost,
  ServerInstance,
} from "./types";

async function reservePort(): Promise<number> {
  const holder = Bun.serve({ port: 0, fetch: () => new Response("ok",), },);
  const port = holder.port;
  await holder.stop();
  if (port === undefined) { throw new Error("reservePort: kernel did not assign a port",); }
  return port;
}

function makeHost(): { host: ServerExternalHost; debugs: string[] } {
  const debugs: string[] = [];

  const log = {
    child: () => log,
    debug: (msg: string,) => {
      debugs.push(msg,);
    },
    info: (msg: string,) => {
      debugs.push(msg,);
    },
    warn: (msg: string,) => {
      debugs.push(msg,);
    },
    error: (msg: string,) => {
      debugs.push(msg,);
    },
    fatal: (msg: string,) => {
      debugs.push(msg,);
    },
  };

  const host: ServerExternalHost = {
    log: log as unknown as ServerExternalHost["log"],
    instances: [],
    probeTimer: null,
    PROBE_INTERVAL_MS: 30_000,
  };

  return { host, debugs, };
}

function makeInstance(type: ServerInstance["type"], port: number, pid: number,): ServerInstance {
  return {
    type,
    process: null,
    port,
    pid,
    startedAt: Date.now(),
  } as unknown as ServerInstance;
}

describe("supervise.gaps", () => {
  test("backoff bounds are the documented 1s base / 30s cap", () => {
    expect(SUPERVISION_BACKOFF_BASE_MS,).toBe(1_000,);
    expect(SUPERVISION_BACKOFF_CAP_MS,).toBe(30_000,);
  });

  test("probeInstance reports a dead port as down (llama-cpp)", async () => {
    expect(await probeInstance(makeInstance("llama-cpp", await reservePort(), 999_001,),),).toBe(false,);
  });

  test("probeInstance reports a dead port as down (sd-cpp)", async () => {
    expect(await probeInstance(makeInstance("sd-cpp", await reservePort(), 999_002,),),).toBe(false,);
  });

  test("startSupervisedProbes registers the interval timer", () => {
    const { host, debugs, } = makeHost();
    startSupervisedProbes(host,);
    expect(host.probeTimer !== null,).toBe(true,);
    expect(debugs,).toContain("Liveliness probes started",);
    if (host.probeTimer !== null) {
      clearInterval(host.probeTimer,);
      host.probeTimer = null;
    }
  });
});
