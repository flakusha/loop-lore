/**
 * Real Server Manager — spawns external AI servers as child processes.
 *
 * Supports llama.cpp (llama-server/llama-server-vk) and sd.cpp (sd-server).
 * Each server type has its own lifecycle: start → health-check → ready → stop.
 *
 * Usage:
 *   const manager = new RealServerManager(logger);
 *   await manager.startLlamaCpp({ port: 9011, modelPath: "/path/to/model.gguf" });
 *   await manager.stopAll();
 *
 * All server start methods return { port, pid } or null if skipped.
 * Stop methods kill the process group gracefully (SIGTERM → SIGKILL).
 * Servers are skipped (not failed) when binaries are missing or ports are busy.
 */

import { spawn, type Subprocess } from "bun";
import { resolve } from "node:path";
import type { Logger } from "../logger";

// ── Types ──────────────────────────────────────────────────

export interface ServerInstance {
  type: "llama-cpp" | "llama-swap" | "sd-cpp";
  process: Subprocess;
  port: number;
  pid: number;
  startedAt: number;
}

export interface LlamaCppOptions {
  port: number;
  /** Local path (/path/to/model.gguf) OR HuggingFace identifier (org/repo:quant) */
  modelPath: string;
  ctxSize?: number;
  extraArgs?: string[];
}

export interface LlamaSwapOptions {
  configPath: string;
}

export interface SdCppOptions {
  port: number;
  modelPath: string;
  llmPath?: string;
  vaePath?: string;
  loraDir?: string;
  extraArgs?: string[];
}

// ── Binary discovery ──────────────────────────────────────

const BINARY_CANDIDATES = {
  "llama-cpp": ["llama-server", "llama-server-vk"],
  "llama-swap": ["llama-swap"],
  "sd-cpp": ["sd-server"],
} as const;

function findBinary(type: keyof typeof BINARY_CANDIDATES): string | null {
  for (const name of BINARY_CANDIDATES[type]) {
    const result = Bun.which(name);
    if (result) return result;
  }
  return null;
}

// ── Port verification ─────────────────────────────────────

async function isPortFree(port: number): Promise<boolean> {
  try {
    const server = Bun.serve({ port, fetch: () => new Response("ok") });
    server.stop();
    return true;
  } catch {
    return false;
  }
}

// ── Health checks ─────────────────────────────────────────

async function waitForHealth(url: string, timeoutMs: number, intervalMs = 500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // Still starting
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/** Wait for process stdout to contain a signal string */
async function waitForStdout(proc: Subprocess, signal: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const stdout = proc.stdout;
  if (!stdout || typeof stdout === "number") return false;
  const reader = stdout.getReader();
  if (!reader) return false;

  let buffer = "";
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);
      if (buffer.includes(signal)) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch {
    // stream closed
  }
  return false;
}

/** Wait for TCP port to respond (any HTTP status = alive) */
async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
      // Any HTTP response (even 404) means server is listening
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

// ── Model path detection ───────────────────────────────────

/** Detect HuggingFace identifier format: org/repo:quant */
function isHuggingFaceRef(path: string): boolean {
  return /^[\w-]+\/[\w.-]+:[\w_]+$/i.test(path);
}

// ── Manager class ─────────────────────────────────────────

export class RealServerManager {
  private instances: ServerInstance[] = [];
  private log: Logger;

  constructor(logger: Logger) {
    this.log = logger.child({ module: "real-server" });
  }

  /** All running server instances */
  get active(): ReadonlyArray<ServerInstance> {
    return this.instances;
  }

  /**
   * Start llama.cpp server on given port.
   * modelPath accepts local path (/path/to/model.gguf) or HuggingFace ID (org/repo:quant).
   * Skips (returns null) if binary not found or port unavailable.
   */
  async startLlamaCpp(opts: LlamaCppOptions): Promise<ServerInstance | null> {
    const binary = findBinary("llama-cpp");
    if (!binary) {
      this.log.warn("llama-server not found in PATH — skipping auto-start", {
        binaryCandidates: BINARY_CANDIDATES["llama-cpp"],
      });
      return null;
    }
    if (!(await isPortFree(opts.port))) {
      this.log.warn("Port in use — skipping llama-cpp auto-start", { port: opts.port });
      return null;
    }

    const isHF = isHuggingFaceRef(opts.modelPath);
    const modelFlag = isHF ? "-hf" : "-m";
    const modelValue = isHF ? opts.modelPath : resolve(opts.modelPath);
    this.log.info("Starting llama.cpp", { binary, port: opts.port, model: modelValue, isHF });
    const proc = spawn({
      cmd: [
        binary,
        modelFlag,
        modelValue,
        "--port",
        String(opts.port),
        "--ctx-size",
        String(opts.ctxSize ?? 8192),
        "--host",
        "127.0.0.1",
        "--no-ui",
        ...(opts.extraArgs ?? []),
      ],
      stdout: "pipe",
      stderr: "pipe",
    });

    const ready = await waitForHealth(`http://127.0.0.1:${opts.port}/health`, 120_000);
    if (!ready) {
      proc.kill();
      this.log.warn("llama-cpp did not become ready within timeout", { port: opts.port });
      return null;
    }

    const instance: ServerInstance = {
      type: "llama-cpp",
      process: proc,
      port: opts.port,
      pid: proc.pid,
      startedAt: Date.now(),
    };
    this.instances.push(instance);
    this.log.info("llama.cpp ready", { port: opts.port, pid: proc.pid });
    return instance;
  }

  /**
   * Start llama-swap proxy with a config file.
   */
  async startLlamaSwap(opts: LlamaSwapOptions): Promise<ServerInstance | null> {
    const binary = findBinary("llama-swap");
    if (!binary) {
      this.log.warn("llama-swap not found in PATH — skipping auto-start");
      return null;
    }

    const resolvedConfig = resolve(opts.configPath);
    this.log.info("Starting llama-swap", { binary, config: resolvedConfig });
    const proc = spawn({
      cmd: [binary, "--config", resolvedConfig, "--host", "127.0.0.1"],
      stdout: "pipe",
      stderr: "pipe",
    });

    // llama-swap exposes health on its first model port
    const ready = await waitForHealth("http://127.0.0.1:8080/health", 30_000);
    if (!ready) {
      proc.kill();
      this.log.warn("llama-swap did not become ready within timeout");
      return null;
    }

    const instance: ServerInstance = {
      type: "llama-swap",
      process: proc,
      port: 8080, // llama-swap default; actual ports from config
      pid: proc.pid,
      startedAt: Date.now(),
    };
    this.instances.push(instance);
    this.log.info("llama-swap ready", { pid: proc.pid });
    return instance;
  }

  /**
   * Start sd-server on given port.
   */
  async startSdCpp(opts: SdCppOptions): Promise<ServerInstance | null> {
    const binary = findBinary("sd-cpp");
    if (!binary) {
      this.log.warn("sd-server not found in PATH — skipping auto-start");
      return null;
    }
    if (!(await isPortFree(opts.port))) {
      this.log.warn("Port in use — skipping sd-cpp auto-start", { port: opts.port });
      return null;
    }

    const args: string[] = [
      binary,
      "--listen-port",
      String(opts.port),
      "-l",
      "127.0.0.1",
      "-m",
      resolve(opts.modelPath),
    ];
    if (opts.llmPath) args.push("--llm", resolve(opts.llmPath));
    if (opts.vaePath) args.push("--vae", resolve(opts.vaePath));
    if (opts.loraDir) args.push("--lora-model-dir", resolve(opts.loraDir));
    if (opts.extraArgs) args.push(...opts.extraArgs);

    this.log.info("Starting sd-server", { binary, port: opts.port, model: opts.modelPath });
    const proc = spawn({
      cmd: args,
      stdout: "pipe",
      stderr: "pipe",
    });

    // sd-server: no liveliness probe. Use TCP port + stdout detection.
    const portReady = await waitForPort(opts.port, 60_000);
    if (!portReady) {
      proc.kill();
      this.log.warn("sd-cpp did not start within timeout", { port: opts.port });
      return null;
    }

    const instance: ServerInstance = {
      type: "sd-cpp",
      process: proc,
      port: opts.port,
      pid: proc.pid,
      startedAt: Date.now(),
    };
    this.instances.push(instance);
    this.log.info("sd-server ready", { port: opts.port, pid: proc.pid });
    return instance;
  }

  /** Stop a specific instance by type + port */
  async stop(instance: ServerInstance): Promise<void> {
    this.log.info("Stopping server", { type: instance.type, pid: instance.pid });
    instance.process.kill("SIGTERM");
    // Wait briefly for graceful shutdown
    await new Promise((r) => setTimeout(r, 500));
    if (!instance.process.killed) {
      instance.process.kill("SIGKILL");
    }
    this.instances = this.instances.filter((i) => i !== instance);
  }

  /** Stop all managed servers */
  async stopAll(): Promise<void> {
    this.log.info("Stopping all managed servers", { count: this.instances.length });
    for (const instance of this.instances) {
      await this.stop(instance);
    }
  }
}
