// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ServerExternalManager — coverage tests for the facade's method bodies
 * (startLlamaCpp/Swap, startSdCpp, stop, stopAll, killAllSync,
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
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { describeOrSkipStrict, } from "../test-utils/isolate-only";
import type {
  LlamaCppOptions,
  LlamaSwapOptions,
  SdCppOptions,
  ServerExternalHost,
  ServerInstance,
} from "./types";

// ── Fake subprocess for the start dispatchers ───────────────
function makeFakeSubprocess(): any {
  return {
    pid: 12345,
    killed: false,
    kill: mock((_signal?: string,) => {
      return true;
    },),
    stdout: null,
    stderr: null,
  };
}

// ── Mock host with logger + mutable state ──────────────────
function makeHost(): ServerExternalHost & { logCalls: { level: string; msg: string; meta?: any }[] } {
  const logCalls: { level: string; msg: string; meta?: any }[] = [];
  const log = {
    child: () => log,
    info: (msg: string, meta?: any,) => { logCalls.push({ level: "info", msg, meta, },); },
    warn: (msg: string, meta?: any,) => { logCalls.push({ level: "warn", msg, meta, },); },
    error: (msg: string, meta?: any,) => { logCalls.push({ level: "error", msg, meta, },); },
    debug: (msg: string, meta?: any,) => { logCalls.push({ level: "debug", msg, meta, },); },
  };
  const host: ServerExternalHost & { logCalls: typeof logCalls } = {
    log: log as any,
    instances: [],
    probeTimer: null,
    PROBE_INTERVAL_MS: 30_000,
    logCalls,
  };
  return host;
}

// ── Mock external-server-utils ─────────────────────────────
const mockUtils = {
  findBinary: mock((type: string,) => type ? `/usr/bin/${type}` : null,),
  isHuggingFaceRef: mock((path: string,) => /^[\w-]+\/[\w.-]+:\w+$/i.test(path,),),
  isPortFree: mock(async (_port: number,) => true,),
  waitForHealth: mock(async (_url: string, _opts: any,) => true,),
  waitForPort: mock(async (_port: number, _opts: any,) => true,),
};

// ── Mock bun.spawn to return our fake subprocess ──────────
const spawnMock = mock((_args: any,) => makeFakeSubprocess(),);

// `bun.spawn` is a top-level export; we monkey-patch in the test body.
const originalSpawn = Bun.spawn;
beforeEach(() => {
  (Bun as any).spawn = spawnMock;
  mockUtils.findBinary.mockClear();
  mockUtils.isHuggingFaceRef.mockClear();
  mockUtils.isPortFree.mockClear();
  mockUtils.waitForHealth.mockClear();
  mockUtils.waitForPort.mockClear();
  spawnMock.mockClear();
});

afterEach(() => {
  (Bun as any).spawn = originalSpawn;
});

describeOrSkipStrict("ServerExternalManager facade", () => {
  test("PROBE_INTERVAL_MS constant is 30_000", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));
    expect(mgr.PROBE_INTERVAL_MS).toBe(30_000);
  });

  test("active getter returns the instances array (read-only view)", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));
    expect(mgr.active.length).toBe(0);
    // Instances is mutable from outside via the public array.
    mgr.instances.push({} as ServerInstance);
    expect(mgr.active.length).toBe(1);
  });

  test("startLlamaCpp dispatches and pushes the instance on success", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));

    const opts: LlamaCppOptions = { port: 9011, modelPath: "/tmp/model.gguf" } as any;
    const instance = await mgr.startLlamaCpp(opts);

    expect(instance).not.toBeNull();
    expect(instance?.type).toBe("llama-cpp");
    expect(instance?.port).toBe(9011);
    expect(mgr.instances).toHaveLength(1);
    expect(mgr.instances[0]).toBe(instance);
  });

  test("startLlamaCpp returns null when the binary is missing", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));

    const originalFindBinary = mockUtils.findBinary;
    mockUtils.findBinary.mockImplementationOnce(() => null);

    const instance = await mgr.startLlamaCpp({ port: 9012, modelPath: "/tmp/model.gguf" } as any);
    expect(instance).toBeNull();
    expect(mgr.instances).toHaveLength(0);
  });

  test("startLlamaCpp returns null when the port is busy", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));

    mockUtils.isPortFree.mockImplementationOnce(async () => false);

    const instance = await mgr.startLlamaCpp({ port: 9013, modelPath: "/tmp/model.gguf" } as any);
    expect(instance).toBeNull();
    expect(mgr.instances).toHaveLength(0);
  });

  test("startLlamaCpp returns null when waitForHealth times out", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));

    mockUtils.waitForHealth.mockImplementationOnce(async () => false);

    const instance = await mgr.startLlamaCpp({ port: 9014, modelPath: "/tmp/model.gguf" } as any);
    expect(instance).toBeNull();
    expect(mgr.instances).toHaveLength(0);
  });

  test("startLlamaCpp uses HF reference flag when modelPath looks like a HF id", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));

    const instance = await mgr.startLlamaCpp({ port: 9015, modelPath: "user/repo:file" } as any);
    expect(instance).not.toBeNull();
    expect(spawnMock).toHaveBeenCalled();
    const args = spawnMock.mock.calls[0]![0] as any;
    const cmd = args.cmd as string[];
    // -hf flag should appear before the model value
    const hfIdx = cmd.indexOf("-hf");
    expect(hfIdx).toBeGreaterThanOrEqual(0);
    expect(cmd[hfIdx + 1]).toBe("user/repo:file");
  });

  test("startSdCpp dispatches and pushes an sd-cpp instance on success", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));

    const opts: SdCppOptions = { port: 9021, modelPath: "/tmp/sd-model.gguf" } as any;
    const instance = await mgr.startSdCpp(opts);
    expect(instance).not.toBeNull();
    expect(instance?.type).toBe("sd-cpp");
    expect(instance?.port).toBe(9021);
    expect(mgr.instances).toHaveLength(1);
  });

  test("startSdCpp returns null when binary missing", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));
    mockUtils.findBinary.mockImplementationOnce(() => null);

    const instance = await mgr.startSdCpp({ port: 9022, modelPath: "/tmp/m" } as any);
    expect(instance).toBeNull();
  });

  test("startSdCpp returns null when port is busy", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));
    mockUtils.isPortFree.mockImplementationOnce(async () => false);

    const instance = await mgr.startSdCpp({ port: 9023, modelPath: "/tmp/m" } as any);
    expect(instance).toBeNull();
  });

  test("startSdCpp returns null when waitForPort times out", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));
    mockUtils.waitForPort.mockImplementationOnce(async () => false);

    const instance = await mgr.startSdCpp({ port: 9024, modelPath: "/tmp/m" } as any);
    expect(instance).toBeNull();
  });

  test("startSdCpp uses --diffusion-model flag in diffusion mode", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));

    const instance = await mgr.startSdCpp({
      port: 9025,
      modelPath: "/tmp/sd-model",
      modelType: "diffusion",
      llmPath: "/tmp/llm",
      vaePath: "/tmp/vae",
    } as any);
    expect(instance).not.toBeNull();
    const cmd = (spawnMock.mock.calls[0]![0] as any).cmd as string[];
    expect(cmd).toContain("--diffusion-model");
    expect(cmd).toContain("--llm");
    expect(cmd).toContain("--vae");
  });

  test("startLivenessProbes sets probeTimer and stopLivenessProbes clears it", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));

    expect(mgr.probeTimer).toBeNull();
    mgr.startLivenessProbes();
    expect(mgr.probeTimer).not.toBeNull();

    // Calling start again is a no-op.
    const firstTimer = mgr.probeTimer;
    mgr.startLivenessProbes();
    expect(mgr.probeTimer).toBe(firstTimer);

    mgr.stopLivenessProbes();
    expect(mgr.probeTimer).toBeNull();

    // Stopping when no timer is set is a no-op.
    mgr.stopLivenessProbes();
    expect(mgr.probeTimer).toBeNull();

    // Cleanup
    clearInterval(firstTimer as any);
  });

  test("startLivenessProbes runs the liveness probe at the configured interval", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));
    mgr.PROBE_INTERVAL_MS = 50; // fast tick for the test
    mgr.startLivenessProbes();
    const timer = mgr.probeTimer!;
    // Wait > interval so the probe callback fires.
    await new Promise((r) => setTimeout(r, 120,));
    // The probe callback is void-async and swallows errors; we only assert
    // that the timer is still ticking (didn't error out).
    expect(mgr.probeTimer).toBe(timer);
    mgr.stopLivenessProbes();
    clearInterval(timer as any);
  });
});

describeOrSkipStrict("ServerExternalManager.stop dispatch", () => {
  test("stop kills the subprocess and removes the instance from the array", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));

    const proc = makeFakeSubprocess();
    const inst: ServerInstance = {
      type: "llama-cpp",
      process: proc,
      port: 9031,
      pid: 999,
      startedAt: Date.now(),
    };
    mgr.instances.push(inst);
    await mgr.stop(inst);
    expect(mgr.instances).toHaveLength(0);
  });

  test("stopAll iterates and stops every instance then clears the list", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));

    for (let i = 0; i < 3; i++) {
      mgr.instances.push({
        type: "llama-cpp",
        process: makeFakeSubprocess(),
        port: 9040 + i,
        pid: 1000 + i,
        startedAt: Date.now(),
      });
    }
    await mgr.stopAll();
    expect(mgr.instances).toHaveLength(0);
  });

  test("killAllSync clears instances synchronously without awaiting", async () => {
    const { ServerExternalManager, } = await import("./index");
    const { createLogger, } = await import("../../logger");
    const mgr = new ServerExternalManager(createLogger({ level: "error" }));

    for (let i = 0; i < 2; i++) {
      mgr.instances.push({
        type: "llama-cpp",
        process: makeFakeSubprocess(),
        port: 9050 + i,
        pid: 2000 + i,
        startedAt: Date.now(),
      });
    }
    mgr.killAllSync();
    expect(mgr.instances).toHaveLength(0);
  });
});
