// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * start-sd gap coverage: missing-binary early-null, port-busy early-null,
 * checkpoint vs diffusion model args, missing-llmPath warning, default
 * modelType, ~ expansion, path/boolean/value flag building, extraArgs.
 *
 * No mock.module. Bun.which snapshots PATH at process start, so each
 * scenario runs in a short-lived `bun` child with a purpose-built startup
 * PATH (scrubbed for missing-binary, stub-dir-first for the rest). Stubs
 * record argv then sleep and are killed by the child — no real servers, no
 * network, ports come from the kernel (port 0). Plain describe so the suite
 * fires under test:coverage.
 */
import { afterAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { fileURLToPath, } from "node:url";

const HELPER_SRC = `
const scenario = process.argv[2] ?? "";
const mod = await import(process.env.LL_MOD ?? "");
const fs = await import("node:fs");
const path = await import("node:path");

const logCalls = [];
const log = {
  child: () => log,
  debug: (msg, meta) => { logCalls.push({ level: "debug", msg, meta, },); },
  info: (msg, meta) => { logCalls.push({ level: "info", msg, meta, },); },
  warn: (msg, meta) => { logCalls.push({ level: "warn", msg, meta, },); },
  error: (msg, meta) => { logCalls.push({ level: "error", msg, meta, },); },
};
const host = { log, instances: [], probeTimer: null, PROBE_INTERVAL_MS: 30000, };


async function reservePort() {
  const holder = Bun.serve({ port: 0, fetch: () => new Response("ok",), },);
  const port = holder.port;
  await holder.stop();
  return port;
}

function readArgs() {
  try {
    return fs.readFileSync(path.join(process.env.LL_STUB ?? "", "sd-server.args",), "utf8",);
  } catch {
    return null;
  }
}

function warns() {
  return logCalls.filter((c,) => c.level === "warn",).map((c,) => c.msg,);
}

// Bind after a short delay so the isPortFree probe (which requires the port
// to be free) runs first; the production waitForPort loop then observes it.
async function runStart(opts) {
  const port = await reservePort();
  const pending = mod.startSdCpp(host, { ...opts, port, },);
  await new Promise((r,) => setTimeout(r, 50,),);
  const server = Bun.serve({ port, fetch: () => new Response("ok",), },);
  try {
    const inst = await pending;
    const result = {
      null: inst === null,
      type: inst?.type ?? null,
      port: inst?.port ?? null,
      count: host.instances.length,
      warns: warns(),
      argv: readArgs(),
    };
    if (inst) { inst.process.kill(); }
    host.instances.length = 0;
    return result;
  } finally {
    await server.stop();
  }
}

const FULL_DIFFUSION = {
  enabled: true,
  modelPath: "~/models/diffusion",
  modelType: "diffusion",
  llmPath: "/tmp/llm.gguf",
  vaePath: "/tmp/vae.safetensors",
  clipLPath: "~/enc/clip_l.safetensors",
  clipGPath: "/tmp/clip_g.safetensors",
  t5xxlPath: "/tmp/t5xxl.safetensors",
  vaeFormat: "flux",
  controlNetPath: "/tmp/control.safetensors",
  loraDir: "/tmp/loras",
  taesdPath: "/tmp/taesd.safetensors",
  hiresUpscalersDir: "/tmp/upscalers",
  embdDir: "/tmp/embd",
  photoMakerPath: "/tmp/pm.safetensors",
  upscaleModelPath: "/tmp/esrgan.safetensors",
  fa: true,
  diffusionFA: true,
  vaeTiling: true,
  eagerLoad: true,
  offloadToCPU: true,
  streamLayers: true,
  autoFit: true,
  maxVram: "8GiB",
  backend: "cpu",
  rng: "cuda",
  samplerRng: "cpu",
  type: "q8_0",
  prediction: "eps",
  cacheMode: "easycache",
  cacheOption: "k=v",
  extraArgs: ["--extra", "1",],
};

let result = { scenario, error: "unknown scenario", };
if (scenario === "sd-missing") {
  const inst = await mod.startSdCpp(host, {
    enabled: true,
    port: 9010,
    modelPath: "/tmp/sd.gguf",
    modelType: "checkpoint",
  },);
  result = { null: inst === null, count: host.instances.length, warns: warns(), };
} else if (scenario === "sd-busy") {
  const holder = Bun.serve({ port: 0, fetch: () => new Response("busy",), },);
  const port = holder.port;
  const inst = await mod.startSdCpp(host, {
    enabled: true,
    port,
    modelPath: "/tmp/sd.gguf",
    modelType: "checkpoint",
  },);
  result = { null: inst === null, count: host.instances.length, warns: warns(), };
  await holder.stop();
} else if (scenario === "sd-checkpoint") {
  result = await runStart({ enabled: true, modelPath: "/tmp/sd-model.gguf", modelType: "checkpoint", },);
} else if (scenario === "sd-default-type") {
  result = await runStart({ enabled: true, modelPath: "/tmp/sd.gguf", },);
} else if (scenario === "sd-diffusion-full") {
  result = await runStart(FULL_DIFFUSION,);
} else if (scenario === "sd-diffusion-no-llm") {
  result = await runStart({ enabled: true, modelPath: "/tmp/diffusion", modelType: "diffusion", },);
} else if (scenario === "sd-minimal") {
  result = await runStart({ enabled: true, modelPath: "/tmp/sd.gguf", modelType: "checkpoint", },);
}
console.log(JSON.stringify(result,));
`;

async function runScenario(helperPath: string, modPath: string, scenario: string, path: string, stub?: string,): Promise<Record<string, unknown>> {
  const proc = Bun.spawn([process.execPath, helperPath, scenario,], {
    env: {
      ...process.env,
      PATH: path,
      LL_MOD: modPath,
      LL_STUB: stub ?? "",
    },
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

function makeStubDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "sd-stub-",),);
  const stubPath = join(dir, "sd-server",);
  writeFileSync(stubPath, `#!/bin/sh\necho "$@" > "${join(dir, "sd-server.args",)}"\nexec sleep 30\n`);
  chmodSync(stubPath, 0o755,);
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true, },);
    },
  };
}

describe("start-sd child harness", () => {
  const modPath = fileURLToPath(new URL("./start-sd.ts", import.meta.url,),);
  const helperDir = mkdtempSync(join(tmpdir(), "sd-helper-",),);
  const helperPath = join(helperDir, "helper.ts",);
  writeFileSync(helperPath, HELPER_SRC,);

  afterAll(() => {
    rmSync(helperDir, { recursive: true, force: true, },);
  },);

  test("sd-missing: null + warn with no binary on PATH", async () => {
    const result = await runScenario(helperPath, modPath, "sd-missing", "/usr/bin:/bin",);
    expect(result.null,).toBe(true,);
    expect(result.count,).toBe(0,);
    expect((result.warns as string[]).some((m,) => m.includes("not found in PATH"),),).toBe(true,);
  }, 15000,);

  test("sd-busy: null + warn when the port is occupied", async () => {
    const stub = makeStubDir();
    try {
      const result = await runScenario(helperPath, modPath, "sd-busy", `${stub.dir}:/usr/bin:/bin`, stub.dir,);
      expect(result.null,).toBe(true,);
      expect(result.count,).toBe(0,);
      expect((result.warns as string[]).some((m,) => m.includes("Port in use"),),).toBe(true,);
    } finally {
      stub.cleanup();
    }
  }, 15000,);

  test("sd-checkpoint: -m mode starts and reports the instance", async () => {
    const stub = makeStubDir();
    try {
      const result = await runScenario(helperPath, modPath, "sd-checkpoint", `${stub.dir}:/usr/bin:/bin`, stub.dir,);
      expect(result.null,).toBe(false,);
      expect(result.type,).toBe("sd-cpp",);
      expect(result.count,).toBe(1,);
      const argv = result.argv as string;
      expect(argv.includes("-m",),).toBe(true,);
      expect(argv.includes("/tmp/sd-model.gguf",),).toBe(true,);
      expect(argv.includes("--diffusion-model",),).toBe(false,);
      expect(argv.includes(`--listen-port ${result.port as number}`,),).toBe(true,);
    } finally {
      stub.cleanup();
    }
  }, 15000,);

  test("sd-default-type: omitted modelType defaults to checkpoint", async () => {
    const stub = makeStubDir();
    try {
      const result = await runScenario(helperPath, modPath, "sd-default-type", `${stub.dir}:/usr/bin:/bin`, stub.dir,);
      expect(result.null,).toBe(false,);
      expect((result.argv as string).includes("-m",),).toBe(true,);
    } finally {
      stub.cleanup();
    }
  }, 15000,);

  test("sd-diffusion-full: every path/boolean/value flag plus extraArgs", async () => {
    const stub = makeStubDir();
    try {
      const result = await runScenario(helperPath, modPath, "sd-diffusion-full", `${stub.dir}:/usr/bin:/bin`, stub.dir,);
      expect(result.null,).toBe(false,);
      expect((result.warns as string[]).some((m,) => m.includes("missing llmPath"),),).toBe(false,);
      const argv = result.argv as string;
      for (const flag of [
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
      ]) {
        expect(argv.includes(flag,),).toBe(true,);
      }
      expect(argv.includes("/models/diffusion",),).toBe(true,);
      expect(argv.includes("~",),).toBe(false,);
    } finally {
      stub.cleanup();
    }
  }, 15000,);

  test("sd-diffusion-no-llm: warns but still starts without --llm", async () => {
    const stub = makeStubDir();
    try {
      const result = await runScenario(helperPath, modPath, "sd-diffusion-no-llm", `${stub.dir}:/usr/bin:/bin`, stub.dir,);
      expect(result.null,).toBe(false,);
      expect((result.warns as string[]).some((m,) => m.includes("missing llmPath"),),).toBe(true,);
      const argv = result.argv as string;
      expect(argv.includes("--diffusion-model",),).toBe(true,);
      expect(argv.includes("--llm",),).toBe(false,);
    } finally {
      stub.cleanup();
    }
  }, 15000,);

  test("sd-minimal: checkpoint without optionals omits every flag", async () => {
    const stub = makeStubDir();
    try {
      const result = await runScenario(helperPath, modPath, "sd-minimal", `${stub.dir}:/usr/bin:/bin`, stub.dir,);
      expect(result.null,).toBe(false,);
      const argv = result.argv as string;
      for (const flag of ["--clip_l", "--fa", "--backend", "--diffusion-model", "--llm", "--vae",]) {
        expect(argv.includes(flag,),).toBe(false,);
      }
    } finally {
      stub.cleanup();
    }
  }, 15000,);
},);
