// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * start-llama gap coverage: missing-binary early-null, port-busy early-null,
 * HF-ref vs local-path model flags, ~ expansion, default ctx-size, full
 * hardware/cache/sampler/advanced arg building, extraArgs, and the
 * llama-swap config-port success path.
 *
 * No mock.module. Bun.which snapshots PATH at process start, so PATH games
 * inside the test process cannot hide or shadow binaries; each scenario runs
 * in a short-lived `bun` child with a purpose-built startup PATH (scrubbed
 * for missing-binary, stub-dir-first for the rest). The stubs record argv
 * then sleep and are killed by the child — no real servers, no network,
 * ports come from the kernel (port 0). Plain describe so the suite fires
 * under test:coverage.
 */
import { afterAll, describe, expect, test, } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { fileURLToPath, } from "node:url";

const HELPER_SRC = `
const scenario = process.argv[2] ?? "";
const mod = await import(process.env.LL_MOD ?? "");
const fs = await import("node:fs");
const os = await import("node:os");
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

function readArgs(name) {
  try {
    return fs.readFileSync(path.join(process.env.LL_STUB ?? "", name + ".args",), "utf8",);
  } catch {
    return null;
  }
}

function warns() {
  return logCalls.filter((c,) => c.level === "warn",).map((c,) => c.msg,);
}

function healthFetch(req) {
  if (new URL(req.url,).pathname === "/health") { return new Response("ok",); }
  return new Response("not found", { status: 404, },);
}

// Bind after a short delay so the isPortFree probe (which requires the port
// to be free) runs first; the production readiness loop then observes it.
async function serveAfter(port, fetch) {
  await new Promise((r,) => setTimeout(r, 100,),);
  return Bun.serve({ port, fetch, },);
}

const FULL_OPTS = {
  enabled: true,
  modelPath: "user/repo:file",
  alias: "test-model",
  ctxSize: 4096,
  threads: 4,
  nGpuLayers: "all",
  device: "cuda0",
  mlock: true,
  cacheTypeK: "q8_0",
  cacheTypeV: "q8_0",
  cacheTypeKD: "f16",
  cacheTypeVD: "f16",
  cacheRam: 1024,
  flashAttn: "on",
  swaFull: true,
  ropeScaling: "yarn",
  ropeScale: 2,
  temp: 0.7,
  topK: 40,
  topP: 0.9,
  minP: 0.05,
  repeatPenalty: 1.1,
  parallelRequests: 4,
  fit: true,
  specType: "ngram-map-k4v",
  specDraftNMin: 1,
  specDraftNMax: 8,
  reasoningBudget: 512,
  jinja: false,
  extraArgs: ["--foo", "bar",],
};

async function runStartSuccess(kind, opts) {
  const port = await reservePort();
  const pending = mod.startLlamaCpp(host, { ...opts, port, },);
  await new Promise((r,) => setTimeout(r, 50,),);
  const server = Bun.serve({ port, fetch: healthFetch, },);
  try {
    const inst = await pending;
    const result = {
      null: inst === null,
      type: inst?.type ?? null,
      port: inst?.port ?? null,
      count: host.instances.length,
      warns: warns(),
    };
    if (inst) { inst.process.kill(); }
    host.instances.length = 0;
    return result;
  } finally {
    await server.stop();
  }
}

let result = { scenario, error: "unknown scenario", };
if (scenario === "llama-missing") {
  const inst = await mod.startLlamaCpp(host, { enabled: true, port: 9011, modelPath: "/tmp/m.gguf", },);
  result = { null: inst === null, count: host.instances.length, warns: warns(), };
} else if (scenario === "swap-missing") {
  const inst = await mod.startLlamaSwap(host, { configPath: "/tmp/swap.yaml", },);
  result = { null: inst === null, count: host.instances.length, warns: warns(), };
} else if (scenario === "llama-busy") {
  const holder = Bun.serve({ port: 0, fetch: () => new Response("busy",), },);
  const port = holder.port;
  const inst = await mod.startLlamaCpp(host, { enabled: true, port, modelPath: "/tmp/m.gguf", },);
  result = { null: inst === null, count: host.instances.length, warns: warns(), };
  await holder.stop();
} else if (scenario === "llama-hf-full") {
  result = { ...(await runStartSuccess("llama", FULL_OPTS,)), argv: readArgs("llama-server",), };
} else if (scenario === "llama-local-min") {
  result = {
    ...(await runStartSuccess("llama", { enabled: true, modelPath: "~/models/m.gguf", },)),
    argv: readArgs("llama-server",),
  };
} else if (scenario === "swap-success") {
  const port = await reservePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swap-cfg-",),);
  const cfgPath = path.join(dir, "config.yaml",);
  fs.writeFileSync(cfgPath, "startPort: " + port + "\\n", "utf8",);
  const pending = mod.startLlamaSwap(host, { configPath: cfgPath, },);
  await new Promise((r,) => setTimeout(r, 50,),);
  const server = Bun.serve({ port, fetch: () => new Response("ok",), },);
  try {
    const inst = await pending;
    result = {
      null: inst === null,
      type: inst?.type ?? null,
      port: inst?.port ?? null,
      count: host.instances.length,
      warns: warns(),
      argv: readArgs("llama-swap",),
    };
    if (inst) { inst.process.kill(); }
    host.instances.length = 0;
  } finally {
    await server.stop();
    fs.rmSync(dir, { recursive: true, force: true, },);
  }
}
console.log(JSON.stringify(result,));
`;

interface ChildEnv {
  path: string;
  stub?: string;
}

async function runScenario(
  helperPath: string,
  modPath: string,
  scenario: string,
  env: ChildEnv,
): Promise<Record<string, unknown>> {
  const proc = Bun.spawn([process.execPath, helperPath, scenario,], {
    env: {
      ...process.env,
      PATH: env.path,
      LL_MOD: modPath,
      LL_STUB: env.stub ?? "",
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

function makeStubDir(names: string[],): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "llama-stub-",),);
  for (const name of names) {
    const stubPath = join(dir, name,);
    writeFileSync(stubPath, `#!/bin/sh\necho "$@" > "${join(dir, `${name}.args`,)}"\nexec sleep 30\n`,);
    chmodSync(stubPath, 0o755,);
  }
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true, },);
    },
  };
}

describe("start-llama child harness", () => {
  const modPath = fileURLToPath(new URL("./start-llama.ts", import.meta.url,),);
  const helperDir = mkdtempSync(join(tmpdir(), "llama-helper-",),);
  const helperPath = join(helperDir, "helper.ts",);
  writeFileSync(helperPath, HELPER_SRC,);

  afterAll(() => {
    rmSync(helperDir, { recursive: true, force: true, },);
  },);

  test("llama-missing: null + warn with no binary on PATH", async () => {
    const result = await runScenario(helperPath, modPath, "llama-missing", { path: "/usr/bin:/bin", },);
    expect(result.null,).toBe(true,);
    expect(result.count,).toBe(0,);
    expect((result.warns as string[]).some((m,) => m.includes("not found in PATH",)),).toBe(true,);
  }, 15000,);

  test("swap-missing: null + warn with no binary on PATH", async () => {
    const result = await runScenario(helperPath, modPath, "swap-missing", { path: "/usr/bin:/bin", },);
    expect(result.null,).toBe(true,);
    expect(result.count,).toBe(0,);
    expect((result.warns as string[]).some((m,) => m.includes("not found in PATH",)),).toBe(true,);
  }, 15000,);

  test("llama-busy: null + warn when the port is occupied", async () => {
    const stub = makeStubDir(["llama-server",],);
    try {
      const result = await runScenario(helperPath, modPath, "llama-busy", {
        path: `${stub.dir}:/usr/bin:/bin`,
        stub: stub.dir,
      },);
      expect(result.null,).toBe(true,);
      expect(result.count,).toBe(0,);
      expect((result.warns as string[]).some((m,) => m.includes("Port in use",)),).toBe(true,);
    } finally {
      stub.cleanup();
    }
  }, 15000,);

  test("llama-hf-full: -hf plus every option flag on success", async () => {
    const stub = makeStubDir(["llama-server",],);
    try {
      const result = await runScenario(helperPath, modPath, "llama-hf-full", {
        path: `${stub.dir}:/usr/bin:/bin`,
        stub: stub.dir,
      },);
      expect(result.null,).toBe(false,);
      expect(result.type,).toBe("llama-cpp",);
      expect(result.count,).toBe(1,);
      const argv = result.argv as string;
      for (
        const flag of [
          "-hf",
          "user/repo:file",
          "--alias",
          "test-model",
          "--ctx-size",
          "4096",
          "-t",
          "--gpu-layers",
          "all",
          "--device",
          "--mlock",
          "-ctk",
          "-ctv",
          "-ctkd",
          "-ctvd",
          "--cache-ram",
          "-fa",
          "--swa-full",
          "--rope-scaling",
          "--rope-scale",
          "--temp",
          "--top-k",
          "--top-p",
          "--min-p",
          "--repeat-penalty",
          "-np",
          "--fit",
          "--spec-type",
          "--spec-draft-n-min",
          "--spec-draft-n-max",
          "--reasoning-budget",
          "--no-jinja",
          "--foo",
          "bar",
          "--no-ui",
          "--port",
        ]
      ) {
        expect(argv.includes(flag,),).toBe(true,);
      }
    } finally {
      stub.cleanup();
    }
  }, 15000,);

  test("llama-local-min: -m with ~ expanded and default ctx-size", async () => {
    const stub = makeStubDir(["llama-server",],);
    try {
      const result = await runScenario(helperPath, modPath, "llama-local-min", {
        path: `${stub.dir}:/usr/bin:/bin`,
        stub: stub.dir,
      },);
      expect(result.null,).toBe(false,);
      expect(result.type,).toBe("llama-cpp",);
      const argv = result.argv as string;
      expect(argv.includes("-m",),).toBe(true,);
      expect(argv.includes("-hf",),).toBe(false,);
      expect(argv.includes("--ctx-size 8192",),).toBe(true,);
      expect(argv.includes("--alias",),).toBe(false,);
      expect(argv.includes("--no-jinja",),).toBe(false,);
      expect(argv.includes("/models/m.gguf",),).toBe(true,);
      expect(argv.includes("~",),).toBe(false,);
    } finally {
      stub.cleanup();
    }
  }, 15000,);

  test("swap-success: startPort from config passed via --listen", async () => {
    const stub = makeStubDir(["llama-swap",],);
    try {
      const result = await runScenario(helperPath, modPath, "swap-success", {
        path: `${stub.dir}:/usr/bin:/bin`,
        stub: stub.dir,
      },);
      expect(result.null,).toBe(false,);
      expect(result.type,).toBe("llama-swap",);
      expect(result.count,).toBe(1,);
      const argv = result.argv as string;
      expect(argv.includes("--config",),).toBe(true,);
      expect(argv.includes(`127.0.0.1:${result.port as number}`,),).toBe(true,);
    } finally {
      stub.cleanup();
    }
  }, 15000,);
});
