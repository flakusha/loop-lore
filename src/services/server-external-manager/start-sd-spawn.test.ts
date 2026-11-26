// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * start-sd in-process coverage: exercises startSdCpp directly (real
 * `Bun.spawn` of a stub sd-server that records argv then sleeps) while
 * mocking only `../external-server-utils` (binary lookup, port checks).
 * No network: ports are never bound (waitForPort mocked), the stub is
 * killed after each start. Plain tests so the suite fires under
 * test:coverage — complements start-sd-gaps.test.ts (child harness,
 * invisible to parent-process coverage).
 */
import { beforeEach, expect, mock, test, } from "bun:test";
import { chmodSync, readFileSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { startSdCpp, } from "./start-sd";
import type { SdCppOptions, ServerExternalHost, } from "./types";

// Bun.spawn children do not see runtime process.env assignments (env is
// snapshotted at process start), so the argv path is baked into the stub.
// Shared across this file's tests (they run sequentially); pid-unique so
// parallel shards never collide. Truncated before every spawn.
const STUB_PATH = join(tmpdir(), `sd-spawn-stub-${process.pid}.sh`,);
const ARGV_PATH = join(tmpdir(), `sd-spawn-argv-${process.pid}.txt`,);

let missingBinary = false;
let portFree = true;
let portReady = true;

mock.module("../external-server-utils", () => ({
  BINARY_CANDIDATES: { "llama-cpp": ["llama-server",], "llama-swap": ["llama-swap",], "sd-cpp": ["sd-server",], },
  findBinary: mock((_type: string,) => missingBinary ? null : STUB_PATH),
  isHuggingFaceRef: mock((_path: string,) => false),
  isPortFree: mock(async (_port: number,) => portFree),
  waitForHealth: mock(async (_url: string, _opts: unknown,) => true),
  waitForPort: mock(async (_port: number, _opts: unknown,) => portReady),
}),);

const warn = mock((..._args: unknown[]) => {},);
const info = mock((..._args: unknown[]) => {},);

writeFileSync(STUB_PATH, `#!/bin/sh\necho "$@" > "${ARGV_PATH}"\nexec sleep 30\n`, { encoding: "utf8", mode: 0o755, },);
chmodSync(STUB_PATH, 0o755,);

beforeEach(() => {
  missingBinary = false;
  portFree = true;
  portReady = true;
  warn.mockClear();
  info.mockClear();
},);

function makeHost(): ServerExternalHost {
  const host = { log: { warn, info, }, instances: [], };
  return host as unknown as ServerExternalHost;
}

function makeArgsFile(): { path: string; cleanup: () => void } {
  writeFileSync(ARGV_PATH, "",);
  return { path: ARGV_PATH, cleanup: () => {}, };
}

async function readArgv(path: string,): Promise<string> {
  // The stub records argv asynchronously after spawn; wait for real output.
  for (let i = 0; i < 200; i++) {
    const text = readFileSync(path, "utf8",);
    if (text.length > 0) { return text; }
    await Bun.sleep(10,);
  }

  throw new Error("stub never recorded argv",);
}

test("checkpoint success records argv and pushes an sd-cpp instance", async () => {
  const host = makeHost();
  const args = makeArgsFile();
  try {
    const opts = { port: 9451, modelPath: "/tmp/sd-model.gguf", extraArgs: ["--listen-ok",], } as SdCppOptions;
    const inst = await startSdCpp(host, opts,);

    expect(inst,).not.toBeNull();
    expect(inst?.type,).toBe("sd-cpp",);
    expect(inst?.port,).toBe(9451,);
    expect(typeof inst?.pid,).toBe("number",);
    expect(Date.now() - (inst?.startedAt ?? 0),).toBeLessThan(60_000,);
    expect(inst?.launch,).toEqual({ kind: "sd-cpp", opts, },);
    expect(host.instances,).toHaveLength(1,);
    expect(host.instances[0],).toBe(inst!,);

    const argv = await readArgv(args.path,);
    expect(argv.includes("--listen-port",),).toBe(true,);
    expect(argv.includes("9451",),).toBe(true,);
    expect(argv.includes("-l",),).toBe(true,);
    expect(argv.includes("127.0.0.1",),).toBe(true,);
    expect(argv.includes("-m",),).toBe(true,);
    expect(argv.includes("/tmp/sd-model.gguf",),).toBe(true,);
    expect(argv.includes("--listen-ok",),).toBe(true,);
    expect(argv.includes("--diffusion-model",),).toBe(false,);
    inst?.process.kill();
  } finally {
    args.cleanup();
  }
});

test("diffusion full build sets every path/boolean/value flag plus extraArgs", async () => {
  const host = makeHost();
  const args = makeArgsFile();
  try {
    const opts = {
      port: 9452,
      modelType: "diffusion",
      modelPath: "~/models/diffusion",
      llmPath: "~/models/llm.gguf",
      vaePath: "/models/vae.safetensors",
      clipLPath: "/models/clip_l.safetensors",
      clipGPath: "/models/clip_g.safetensors",
      t5xxlPath: "/models/t5xxl.safetensors",
      vaeFormat: "flux",
      controlNetPath: "/models/control.safetensors",
      loraDir: "/models/loras",
      taesdPath: "/models/taesd.safetensors",
      hiresUpscalersDir: "/models/upscalers",
      embdDir: "/models/embed",
      photoMakerPath: "/models/photo.bin",
      upscaleModelPath: "/models/upscale.bin",
      fa: true,
      diffusionFA: true,
      vaeTiling: true,
      eagerLoad: true,
      offloadToCPU: true,
      streamLayers: true,
      autoFit: true,
      maxVram: "8192",
      backend: "cuda",
      rng: "cuda",
      samplerRng: "cpu",
      type: "f16",
      prediction: "v2",
      cacheMode: "ram",
      cacheOption: "q8_0",
      extraArgs: ["--extra",],
    } as unknown as SdCppOptions;

    const inst = await startSdCpp(host, opts,);

    expect(inst,).not.toBeNull();
    expect(warn.mock.calls.some((c,) => String(c[0],).includes("missing llmPath",)),).toBe(false,);
    const argv = await readArgv(args.path,);
    for (
      const flag of [
        "--diffusion-model",
        "--llm",
        "--vae",
        "--clip_l",
        "--clip_g",
        "--t5xxl",
        "--vae-format",
        "flux",
        "--control-net",
        "--lora-model-dir",
        "--taesd",
        "--hires-upscalers-dir",
        "--embd-dir",
        "--photo-maker",
        "--upscale-model",
        "--fa",
        "--diffusion-fa",
        "--vae-tiling",
        "--eager-load",
        "--offload-to-cpu",
        "--stream-layers",
        "--auto-fit",
        "--max-vram",
        "--backend",
        "--rng",
        "--sampler-rng",
        "--type",
        "--prediction",
        "--cache-mode",
        "--cache-option",
        "--extra",
      ]
    ) {
      expect(argv.includes(flag,),).toBe(true,);
    }

    expect(argv.includes("/models/diffusion",),).toBe(true,);
    expect(argv.includes("~",),).toBe(false,);
    inst?.process.kill();
  } finally {
    args.cleanup();
  }
});

test("diffusion without llmPath warns but starts without --llm", async () => {
  const host = makeHost();
  const args = makeArgsFile();
  try {
    const opts = {
      port: 9453,
      modelType: "diffusion",
      modelPath: "/models/diffusion",
    } as SdCppOptions;

    const inst = await startSdCpp(host, opts,);

    expect(inst,).not.toBeNull();
    expect(warn.mock.calls.some((c,) => String(c[0],).includes("missing llmPath",)),).toBe(true,);
    const argv = await readArgv(args.path,);
    expect(argv.includes("--diffusion-model",),).toBe(true,);
    expect(argv.includes("--llm",),).toBe(false,);
    inst?.process.kill();
  } finally {
    args.cleanup();
  }
});

test("minimal checkpoint omits every optional flag", async () => {
  const host = makeHost();
  const args = makeArgsFile();
  try {
    const opts = { port: 9454, modelPath: "/tmp/min.gguf", } as SdCppOptions;
    const inst = await startSdCpp(host, opts,);

    expect(inst,).not.toBeNull();
    const argv = await readArgv(args.path,);
    for (
      const flag of [
        "--diffusion-model",
        "--llm",
        "--vae",
        "--clip_l",
        "--clip_g",
        "--t5xxl",
        "--control-net",
        "--fa",
        "--backend",
        "--max-vram",
        "--extra",
      ]
    ) {
      expect(argv.includes(flag,),).toBe(false,);
    }

    inst?.process.kill();
  } finally {
    args.cleanup();
  }
});

test("missing binary returns null without spawning", async () => {
  missingBinary = true;
  const host = makeHost();
  const inst = await startSdCpp(host, { port: 9455, modelPath: "/tmp/m.gguf", } as SdCppOptions,);

  expect(inst,).toBeNull();
  expect(host.instances,).toHaveLength(0,);
  expect(warn.mock.calls.some((c,) => String(c[0],).includes("not found in PATH",)),).toBe(true,);
});

test("busy port returns null without spawning", async () => {
  portFree = false;
  const host = makeHost();
  const inst = await startSdCpp(host, { port: 9456, modelPath: "/tmp/m.gguf", } as SdCppOptions,);

  expect(inst,).toBeNull();
  expect(host.instances,).toHaveLength(0,);
  expect(warn.mock.calls.some((c,) => String(c[0],).includes("Port in use",)),).toBe(true,);
});

test("waitForPort timeout kills the proc and returns null", async () => {
  portReady = false;
  const host = makeHost();
  const opts = { port: 9457, modelPath: "/tmp/m.gguf", } as SdCppOptions;
  const inst = await startSdCpp(host, opts,);

  expect(inst,).toBeNull();
  expect(host.instances,).toHaveLength(0,);
  expect(warn.mock.calls.some((c,) => String(c[0],).includes("did not start within timeout",)),).toBe(true,);
});
