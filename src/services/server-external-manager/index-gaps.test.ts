// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ServerExternalManager facade gap coverage: constructor/active getter,
 * startLlamaCpp / startLlamaSwap / startSdCpp delegation (success plus
 * missing-binary nulls), stop / stopAll / killAllSync delegation, and the
 * liveness-probe wrappers.
 *
 * No mock.module. Start delegation runs in short-lived `bun` children with
 * purpose-built startup PATHs (Bun.which snapshots PATH at process start, so
 * in-process PATH games cannot work); stop/probe delegation uses hand-rolled
 * fake processes in-process. Plain describe so the suite fires under
 * test:coverage.
 */
import { afterAll, describe, expect, mock, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { fileURLToPath, } from "node:url";
import { ServerExternalManager, } from "./index";
import type { ServerInstance, } from "./types";
import { createLogger, } from "../../logger";

const HELPER_SRC = `
const scenario = process.argv[2] ?? "";
const mod = await import(process.env.LL_MOD ?? "");
const fs = await import("node:fs");
const os = await import("node:os");
const path = await import("node:path");
const loggerMod = await import(process.env.LL_LOGGER ?? "");

const mgr = new mod.ServerExternalManager(loggerMod.createLogger({ level: "error", },),);

async function reservePort() {
  const holder = Bun.serve({ port: 0, fetch: () => new Response("ok",), },);
  const port = holder.port;
  await holder.stop();
  return port;
}

function healthFetch(req) {
  if (new URL(req.url,).pathname === "/health") { return new Response("ok",); }
  return new Response("not found", { status: 404, },);
}

async function serveAfter(port, fetch) {
  await new Promise((r,) => setTimeout(r, 100,),);
  return Bun.serve({ port, fetch, },);
}

let result = { scenario, error: "unknown scenario", };
if (scenario === "llama-success") {
  const port = await reservePort();
  const pending = mgr.startLlamaCpp({ enabled: true, port, modelPath: "/tmp/m.gguf", },);
  await new Promise((r,) => setTimeout(r, 50,),);
  const server = Bun.serve({ port, fetch: healthFetch, },);
  try {
    const inst = await pending;
    result = { null: inst === null, type: inst?.type ?? null, port: inst?.port ?? null, count: mgr.active.length, };
    if (inst) { inst.process.kill(); }
    mgr.instances.length = 0;
  } finally {
    await server.stop();
  }
} else if (scenario === "swap-success") {
  const port = await reservePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "facade-swap-",),);
  const cfgPath = path.join(dir, "config.yaml",);
  fs.writeFileSync(cfgPath, "startPort: " + port + "\\n", "utf8",);
  const pending = mgr.startLlamaSwap({ configPath: cfgPath, },);
  await new Promise((r,) => setTimeout(r, 50,),);
  const server = Bun.serve({ port, fetch: () => new Response("ok",), },);
  try {
    const inst = await pending;
    result = { null: inst === null, type: inst?.type ?? null, port: inst?.port ?? null, count: mgr.active.length, };
    if (inst) { inst.process.kill(); }
    mgr.instances.length = 0;
  } finally {
    await server.stop();
    fs.rmSync(dir, { recursive: true, force: true, },);
  }
} else if (scenario === "sd-success") {
  const port = await reservePort();
  const pending = mgr.startSdCpp({
      enabled: true,
      port,
      modelPath: "/tmp/sd.gguf",
      modelType: "checkpoint",
    },);
    await new Promise((r,) => setTimeout(r, 50,),);
    const server = Bun.serve({ port, fetch: () => new Response("ok",), },);
    try {
      const inst = await pending;
      result = { null: inst === null, type: inst?.type ?? null, port: inst?.port ?? null, count: mgr.active.length, };
    if (inst) { inst.process.kill(); }
    mgr.instances.length = 0;
  } finally {
    await server.stop();
  }
} else if (scenario === "llama-null") {
  const inst = await mgr.startLlamaCpp({ enabled: true, port: 9011, modelPath: "/tmp/m.gguf", },);
  result = { null: inst === null, count: mgr.active.length, };
} else if (scenario === "swap-null") {
  const inst = await mgr.startLlamaSwap({ configPath: "/tmp/swap.yaml", },);
  result = { null: inst === null, count: mgr.active.length, };
} else if (scenario === "sd-null") {
  const inst = await mgr.startSdCpp({
    enabled: true,
    port: 9010,
    modelPath: "/tmp/sd.gguf",
    modelType: "checkpoint",
  },);
  result = { null: inst === null, count: mgr.active.length, };
}
console.log(JSON.stringify(result,));
`;

async function runScenario(helperPath: string, paths: Record<string, string>, scenario: string, path: string,): Promise<Record<string, unknown>> {
  const proc = Bun.spawn([process.execPath, helperPath, scenario,], {
    env: { ...process.env, PATH: path, ...paths, },
    stdout: "pipe",
    stderr: "pipe",
  },);
  try {
    const text = await new Response(proc.stdout,).text();
    await proc.exited;
    return JSON.parse(text.trim(),) as Record<string, unknown>;
  } finally {
    try {
      proc.kill();
    } catch {
      /* already exited */
    }
  }
}

function makeStubDir(names: string[]): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "facade-stub-",),);
  for (const name of names) {
    const stubPath = join(dir, name,);
    writeFileSync(stubPath, `#!/bin/sh\necho "$@" > "${join(dir, `${name}.args`,)}"\nexec sleep 30\n`);
    chmodSync(stubPath, 0o755,);
  }
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true, },);
    },
  };
}

function makeFakeProc(): unknown {
  return {
    pid: 4242,
    killed: false,
    kill: mock((_signal?: string,) => true),
    stdout: null,
    stderr: null,
  };
}

describe("ServerExternalManager facade child harness", () => {
  const helperDir = mkdtempSync(join(tmpdir(), "facade-helper-",),);
  const helperPath = join(helperDir, "helper.ts",);
  writeFileSync(helperPath, HELPER_SRC,);
  const paths = {
    LL_MOD: fileURLToPath(new URL("./index.ts", import.meta.url,),),
    LL_LOGGER: fileURLToPath(new URL("../../logger/index.ts", import.meta.url,),),
  };

  afterAll(() => {
    rmSync(helperDir, { recursive: true, force: true, },);
  },);

  test("startLlamaCpp delegation succeeds and tracks the instance", async () => {
    const stub = makeStubDir(["llama-server",],);
    try {
      const result = await runScenario(helperPath, paths, "llama-success", `${stub.dir}:/usr/bin:/bin`,);
      expect(result.null,).toBe(false,);
      expect(result.type,).toBe("llama-cpp",);
      expect(result.count,).toBe(1,);
    } finally {
      stub.cleanup();
    }
  }, 15000,);

  test("startLlamaSwap delegation succeeds and tracks the instance", async () => {
    const stub = makeStubDir(["llama-swap",],);
    try {
      const result = await runScenario(helperPath, paths, "swap-success", `${stub.dir}:/usr/bin:/bin`,);
      expect(result.null,).toBe(false,);
      expect(result.type,).toBe("llama-swap",);
      expect(result.count,).toBe(1,);
    } finally {
      stub.cleanup();
    }
  }, 15000,);

  test("startSdCpp delegation succeeds and tracks the instance", async () => {
    const stub = makeStubDir(["sd-server",],);
    try {
      const result = await runScenario(helperPath, paths, "sd-success", `${stub.dir}:/usr/bin:/bin`,);
      expect(result.null,).toBe(false,);
      expect(result.type,).toBe("sd-cpp",);
      expect(result.count,).toBe(1,);
    } finally {
      stub.cleanup();
    }
  }, 15000,);

  test("start methods propagate null when binaries are missing", async () => {
    for (const scenario of ["llama-null", "swap-null", "sd-null",]) {
      const result = await runScenario(helperPath, paths, scenario, "/usr/bin:/bin",);
      expect(result.null,).toBe(true,);
      expect(result.count,).toBe(0,);
    }
  }, 15000,);
},);

describe("ServerExternalManager facade basics", () => {
  test("constructor wires a child logger and active starts empty", () => {
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    expect(mgr.PROBE_INTERVAL_MS,).toBe(30_000,);
    expect(mgr.active,).toHaveLength(0,);
    expect(mgr.probeTimer,).toBeNull();
  },);
},);

describe("ServerExternalManager stop delegation", () => {
  test("stop removes the instance from active", async () => {
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    const instance: ServerInstance = {
      type: "llama-cpp",
      process: makeFakeProc() as ServerInstance["process"],
      port: 9201,
      pid: 9201,
      startedAt: Date.now(),
    };
    mgr.instances.push(instance,);
    await mgr.stop(instance,);
    expect(mgr.active,).toHaveLength(0,);
  },);

  test("stopAll clears every instance", async () => {
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    for (let i = 0; i < 2; i++) {
      mgr.instances.push({
        type: "sd-cpp",
        process: makeFakeProc() as ServerInstance["process"],
        port: 9210 + i,
        pid: 9210 + i,
        startedAt: Date.now(),
      },);
    }
    await mgr.stopAll();
    expect(mgr.active,).toHaveLength(0,);
  },);

  test("killAllSync clears instances with dead pids without throwing", () => {
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    for (let i = 0; i < 2; i++) {
      mgr.instances.push({
        type: "llama-cpp",
        process: makeFakeProc() as ServerInstance["process"],
        port: 9220 + i,
        pid: 2_100_000_000 + i,
        startedAt: Date.now(),
      },);
    }
    mgr.killAllSync();
    expect(mgr.active,).toHaveLength(0,);
  },);
},);

describe("ServerExternalManager probe delegation", () => {
  test("startLivenessProbes sets the timer and stopLivenessProbes clears it", () => {
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    try {
      mgr.startLivenessProbes();
      expect(mgr.probeTimer,).not.toBeNull();
      mgr.startLivenessProbes();
      expect(mgr.probeTimer,).not.toBeNull();
    } finally {
      mgr.stopLivenessProbes();
    }
    expect(mgr.probeTimer,).toBeNull();
  },);
},);
