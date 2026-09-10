// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ServerExternalManager — coverage tests for the facade's method bodies
 * (startLlamaCpp, startSdCpp, stop, stopAll, killAllSync,
 * startLivenessProbes, stopLivenessProbes) plus the `active` getter and
 * `PROBE_INTERVAL_MS` constant.
 *
 * The class is a thin pass-through to sibling dispatchers; the goal is
 * to exercise every dispatch path through the facade with mocked
 * dependencies (binaries, ports, health probes) so the wrapper never
 * spawns a real subprocess.
 *
 * Uses `mock.module` so the run requires strict isolation
 * (`bun run test:unit` sets `npm_lifecycle_event=test:unit`, which gates
 * this via `describeOrSkipStrict`).
 */
import {
  afterEach,
  beforeEach,
  expect,
  mock,
  test,
} from "bun:test";
import { describeOrSkipStrict, } from "../../test-utils/isolate-only";
import type {
  LlamaCppOptions,
  SdCppOptions,
  ServerInstance,
} from "./types";

// ── Fake subprocess for the start dispatchers ───────────────
function makeFakeSubprocess(): unknown {
  return {
    pid: 12345,
    killed: false,
    kill: mock((_signal?: string,) => true),
    stdout: null,
    stderr: null,
  };
}

// ── Mock external-server-utils ─────────────────────────────
//
// `mock.module` must export every named export the downstream `import` uses
// (findBinary, isPortFree, waitForHealth, waitForPort, isHuggingFaceRef,
// BINARY_CANDIDATES) or bun throws "Export named '…' not found in module".
const mockUtils = {
  BINARY_CANDIDATES: {
    "llama-cpp": ["llama-server", "llama-server-vk",],
    "llama-swap": ["llama-swap",],
    "sd-cpp": ["sd-server",],
  },
  findBinary: mock((type: string,) => type ? `/usr/bin/${type}` : null),
  isHuggingFaceRef: mock((path: string,) => /^[\w-]+\/[\w.-]+:\w+$/i.test(path,)),
  isPortFree: mock(async (_port: number,) => true),
  waitForHealth: mock(async (_url: string, _opts: unknown,) => true),
  waitForPort: mock(async (_port: number, _opts: unknown,) => true),
};

// ── Mock bun.spawn to return our fake subprocess ──────────
const spawnMock = mock((_args: unknown,) => makeFakeSubprocess());

if (process.env.npm_lifecycle_event === "test:unit") {
  mock.module("../external-server-utils", () => mockUtils,);
  // Pin Bun.spawn for the whole file run.
  (Bun as unknown as { spawn: unknown }).spawn = spawnMock;
}

beforeEach(() => {
  mockUtils.findBinary.mockClear();
  mockUtils.isHuggingFaceRef.mockClear();
  mockUtils.isPortFree.mockClear();
  mockUtils.waitForHealth.mockClear();
  mockUtils.waitForPort.mockClear();
  spawnMock.mockClear();
},);

afterEach(() => {
  // No restoration needed — file-level (Bun.spawn stays mocked).
},);

describeOrSkipStrict("ServerExternalManager facade", () => {
  test("PROBE_INTERVAL_MS constant is 30_000", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    expect(mgr.PROBE_INTERVAL_MS,).toBe(30_000,);
  });

  test("active getter returns the instances array (read-only view)", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    expect(mgr.active.length,).toBe(0,);
    mgr.instances.push({} as ServerInstance,);
    expect(mgr.active.length,).toBe(1,);
  });

  test("startLlamaCpp dispatches and pushes the instance on success", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);

    const opts = { port: 9011, modelPath: "/tmp/model.gguf", } as LlamaCppOptions;
    const instance = await mgr.startLlamaCpp(opts,);

    expect(instance,).not.toBeNull();
    expect(instance?.type,).toBe("llama-cpp",);
    expect(instance?.port,).toBe(9011,);
    expect(mgr.instances,).toHaveLength(1,);
    expect(mgr.instances[0],).toBe(instance,);
  });

  test("startLlamaCpp returns null when the binary is missing", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);

    mockUtils.findBinary.mockImplementationOnce(() => null);

    const instance = await mgr.startLlamaCpp({ port: 9012, modelPath: "/tmp/model.gguf", } as LlamaCppOptions,);
    expect(instance,).toBeNull();
    expect(mgr.instances,).toHaveLength(0,);
  });

  test("startLlamaCpp returns null when the port is busy", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);

    mockUtils.isPortFree.mockImplementationOnce(async () => false);

    const instance = await mgr.startLlamaCpp({ port: 9013, modelPath: "/tmp/model.gguf", } as LlamaCppOptions,);
    expect(instance,).toBeNull();
    expect(mgr.instances,).toHaveLength(0,);
  });

  test("startLlamaCpp returns null when waitForHealth times out", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);

    mockUtils.waitForHealth.mockImplementationOnce(async () => false);

    const instance = await mgr.startLlamaCpp({ port: 9014, modelPath: "/tmp/model.gguf", } as LlamaCppOptions,);
    expect(instance,).toBeNull();
    expect(mgr.instances,).toHaveLength(0,);
  });

  test("startLlamaCpp uses HF reference flag when modelPath looks like a HF id", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);

    const instance = await mgr.startLlamaCpp({ port: 9015, modelPath: "user/repo:file", } as LlamaCppOptions,);
    expect(instance,).not.toBeNull();
    expect(spawnMock,).toHaveBeenCalled();
    const args = spawnMock.mock.calls[0]![0] as { cmd: string[] };
    const cmd = args.cmd;
    const hfIdx = cmd.indexOf("-hf",);
    expect(hfIdx,).toBeGreaterThanOrEqual(0,);
    expect(cmd[hfIdx + 1],).toBe("user/repo:file",);
  });

  test("startSdCpp dispatches and pushes an sd-cpp instance on success", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);

    const opts = { port: 9021, modelPath: "/tmp/sd-model.gguf", } as SdCppOptions;
    const instance = await mgr.startSdCpp(opts,);
    expect(instance,).not.toBeNull();
    expect(instance?.type,).toBe("sd-cpp",);
    expect(instance?.port,).toBe(9021,);
    expect(mgr.instances,).toHaveLength(1,);
  });

  test("startSdCpp returns null when binary missing", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    mockUtils.findBinary.mockImplementationOnce(() => null);

    const instance = await mgr.startSdCpp({ port: 9022, modelPath: "/tmp/m", } as SdCppOptions,);
    expect(instance,).toBeNull();
  });

  test("startSdCpp returns null when port is busy", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    mockUtils.isPortFree.mockImplementationOnce(async () => false);

    const instance = await mgr.startSdCpp({ port: 9023, modelPath: "/tmp/m", } as SdCppOptions,);
    expect(instance,).toBeNull();
  });

  test("startSdCpp returns null when waitForPort times out", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    mockUtils.waitForPort.mockImplementationOnce(async () => false);

    const instance = await mgr.startSdCpp({ port: 9024, modelPath: "/tmp/m", } as SdCppOptions,);
    expect(instance,).toBeNull();
  });

  test("startSdCpp uses --diffusion-model flag in diffusion mode", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);

    const instance = await mgr.startSdCpp({
      port: 9025,
      modelPath: "/tmp/sd-model",
      modelType: "diffusion",
      llmPath: "/tmp/llm",
      vaePath: "/tmp/vae",
    } as unknown as SdCppOptions,);
    expect(instance,).not.toBeNull();
    const cmd = (spawnMock.mock.calls[0]![0] as { cmd: string[] }).cmd;
    expect(cmd,).toContain("--diffusion-model",);
    expect(cmd,).toContain("--llm",);
    expect(cmd,).toContain("--vae",);
  });

  test("startLivenessProbes sets probeTimer; stop clears it; idempotent", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);

    mgr.startLivenessProbes();
    expect(mgr.probeTimer,).not.toBeNull();

    const firstTimer = mgr.probeTimer;
    mgr.startLivenessProbes();
    expect(mgr.probeTimer,).toBe(firstTimer,);

    mgr.stopLivenessProbes();
    expect(mgr.probeTimer,).toBeNull();
    mgr.stopLivenessProbes();
    expect(mgr.probeTimer,).toBeNull();

    clearInterval(firstTimer as unknown as ReturnType<typeof setInterval>,);
  });
},);

describeOrSkipStrict("ServerExternalManager.startLlamaSwap path", () => {
  test("startLlamaSwap dispatches and pushes a llama-swap instance on success", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    // Provide a config file that resolveLlamaSwapPort can read.
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llama-swap-",),);
    const cfgPath = path.join(tmpDir, "config.yaml",);
    fs.writeFileSync(cfgPath, "startPort: 9091\n", "utf8",);
    try {
      const opts = { configPath: cfgPath, } as { configPath: string };
      const instance = await mgr.startLlamaSwap(opts as unknown as { configPath: string },);
      expect(instance,).not.toBeNull();
      expect(instance?.type,).toBe("llama-swap",);
      expect(instance?.port,).toBe(9091,);
      expect(mgr.instances,).toHaveLength(1,);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true, },);
    }
  });

  test("startLlamaSwap returns null when the binary is missing", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);
    mockUtils.findBinary.mockImplementationOnce(() => null);
    const instance = await mgr.startLlamaSwap({
      configPath: "/tmp/nonexistent-config.yaml",
    } as unknown as { configPath: string },);
    expect(instance,).toBeNull();
    expect(mgr.instances,).toHaveLength(0,);
  });
},);

describeOrSkipStrict("ServerExternalManager.stop dispatch", () => {
  test("stop kills the subprocess and removes the instance from the array", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);

    const proc = makeFakeSubprocess();
    const inst: ServerInstance = {
      type: "llama-cpp",
      process: proc as ServerInstance["process"],
      port: 9031,
      pid: 999,
      startedAt: Date.now(),
    };
    mgr.instances.push(inst,);
    await mgr.stop(inst,);
    expect(mgr.instances,).toHaveLength(0,);
  });

  test("stopAll iterates and stops every instance then clears the list", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);

    for (let i = 0; i < 3; i++) {
      mgr.instances.push({
        type: "llama-cpp",
        process: makeFakeSubprocess() as ServerInstance["process"],
        port: 9040 + i,
        pid: 1000 + i,
        startedAt: Date.now(),
      },);
    }
    await mgr.stopAll();
    expect(mgr.instances,).toHaveLength(0,);
  });

  test("killAllSync clears instances synchronously without awaiting", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error", },),);

    for (let i = 0; i < 2; i++) {
      mgr.instances.push({
        type: "llama-cpp",
        process: makeFakeSubprocess() as ServerInstance["process"],
        port: 9050 + i,
        pid: 2000 + i,
        startedAt: Date.now(),
      },);
    }
    mgr.killAllSync();
    expect(mgr.instances,).toHaveLength(0,);
  });
},);
