/**
 * Server External Manager for E2E Tests
 *
 * Spawns and manages external server processes for real-hardware testing.
 * Each server type has its own lifecycle: start → health-check → ready → stop.
 *
 * Usage:
 *   const manager = new ServerExternalManager();
 *   await manager.startLlamaCpp({ port: 9011, modelPath: "/path/to/model.gguf" });
 *   // Run tests...
 *   await manager.stopAll();
 *
 * All server start methods return { port, pid }. Stop methods kill the process group.
 * Tests are skipped (not failed) when binaries or models are missing.
 */

import { spawn, type Subprocess } from "bun";
import { resolve } from "node:path";
import type { Logger } from "../../../src/logger";


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
  const candidates = BINARY_CANDIDATES[type];
  for (const name of candidates) {
    const result = Bun.which(name);
    if (result) return result;
  }
  return null;
}

// ── Port verification ─────────────────────────────────────

function isPortFree(port: number): boolean {
  try {
    const server = Bun.serve({ port, fetch: () => new Response("ok") });
    server.stop();
    return true;
  } catch {
    return false;
  }
}

// ── Health check option types ─────────────────────────────

interface WaitForHealthOptions {
  /** Max wait in ms */
  timeoutMs: number;
  /** Poll interval in ms (default 500) */
  intervalMs?: number;
}

interface WaitForStdoutOptions {
  /** String to look for in stdout */
  signal: string;
  /** Max wait in ms */
  timeoutMs: number;
  /** Decode encoding (default utf-8) */
  encoding?: string;
}

interface WaitForPortOptions {
  /** Max wait in ms */
  timeoutMs: number;
}

// ── Health checks ─────────────────────────────────────────

async function waitForHealth(
  url: string,
  opts: WaitForHealthOptions,
): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? 500;
  const deadline = Date.now() + opts.timeoutMs;
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function waitForStdout(
  proc: Subprocess,
  opts: WaitForStdoutOptions,
): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs;
  const reader = proc.stdout?.getReader();
  if (!reader) return false;

  let buffer = "";
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);
      if (buffer.includes(opts.signal)) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch {
    // stream closed
  }
  return false;
}

/** Wait for TCP port to respond (any HTTP status = alive) */
async function waitForPort(port: number, opts: WaitForPortOptions): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
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
  return /^[\w-]+\/[\w.-]+:\w+$/i.test(path);
}

// ── Manager class ─────────────────────────────────────────

export class ServerExternalManager {
  private instances: ServerInstance[] = [];
  private log: Logger;
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private readonly PROBE_INTERVAL_MS = 30_000;

  constructor(logger: Logger) {
    this.log = logger.child({ module: "server-external" });
  }

  // ── Private: liveliness probing ─────────────────────────

  /** Probe a single instance — returns true if responsive */
  private async probeInstance(instance: ServerInstance): Promise<boolean> {
    try {
      if (instance.type === "llama-cpp" || instance.type === "llama-swap") {
        const res = await fetch(`http://127.0.0.1:${instance.port}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      }
      // sd-cpp: any TCP response = alive
      await fetch(`http://127.0.0.1:${instance.port}/`, {
        signal: AbortSignal.timeout(5000),
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Run a single liveness check against all managed instances */
  private async checkAllLiveliness(): Promise<void> {
    for (const instance of this.instances) {
      const alive = await this.probeInstance(instance);
      if (!alive) {
        this.log.warn("External server unresponsive", {
          type: instance.type,
          port: instance.pid,
          pid: instance.pid,
        });
      }
    }
  }

  // ── Public API ──────────────────────────────────────────

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
      this.log.warn("llama-server not found in PATH — skipping");
      return null;
    }
    if (!(await isPortFree(opts.port))) {
      this.log.warn(`port ${opts.port} in use — skipping llama-cpp`);
      return null;
    }

    const isHF = isHuggingFaceRef(opts.modelPath);
    const modelFlag = isHF ? "-hf" : "-m";
    const modelValue = isHF ? opts.modelPath : resolve(opts.modelPath);
    const proc = spawn({
      cmd: [
        binary,
        modelFlag, modelValue,
        "--port", String(opts.port),
        "--ctx-size", String(opts.ctxSize ?? 8192),
        "--host", "127.0.0.1",
        "--no-ui",
        ...(opts.extraArgs ?? []),
      ],
      stdout: "pipe",
      stderr: "pipe",
    });

    const ready = await waitForHealth(
      `http://127.0.0.1:${opts.port}/health`,
      { timeoutMs: 15_000 },
    );
    if (!ready) {
      proc.kill();
      this.log.warn(`llama-cpp on ${opts.port} did not become ready`);
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
    return instance;
  }

  /**
   * Start llama-swap proxy with a config file.
   */
  async startLlamaSwap(opts: LlamaSwapOptions): Promise<ServerInstance | null> {
    const binary = findBinary("llama-swap");
    if (!binary) {
      this.log.warn("llama-swap not found in PATH — skipping");
      return null;
    }

    const resolvedConfig = resolve(opts.configPath);
    const proc = spawn({
      cmd: [binary, "--config", resolvedConfig, "--host", "127.0.0.1"],
      stdout: "pipe",
      stderr: "pipe",
    });

    // llama-swap exposes health on its first model port
    const ready = await waitForHealth("http://127.0.0.1:8080/health", { timeoutMs: 30_000 });
    if (!ready) {
      proc.kill();
      this.log.warn("llama-swap did not become ready");
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
    return instance;
  }

  /**
   * Start sd-server on given port.
   */
  async startSdCpp(opts: SdCppOptions): Promise<ServerInstance | null> {
    const binary = findBinary("sd-cpp");
    if (!binary) {
      this.log.warn("sd-server not found in PATH — skipping");
      return null;
    }
    if (!(await isPortFree(opts.port))) {
      this.log.warn(`port ${opts.port} in use — skipping sd-cpp`);
      return null;
    }

    const args: string[] = [
      binary,
      "--listen-port", String(opts.port),
      "-l", "127.0.0.1",
      "-m", resolve(opts.modelPath),
    ];
    if (opts.llmPath) args.push("--llm", resolve(opts.llmPath));
    if (opts.vaePath) args.push("--vae", resolve(opts.vaePath));
    if (opts.loraDir) args.push("--lora-model-dir", resolve(opts.loraDir));
    if (opts.extraArgs) args.push(...opts.extraArgs);

    const proc = spawn({
      cmd: args,
      stdout: "pipe",
      stderr: "pipe",
    });

    // sd-server: no liveliness probe. Use TCP port + stdout detection.
    const portReady = await waitForPort(opts.port, { timeoutMs: 60_000 });
    if (!portReady) {
      proc.kill();
      this.log.warn(`sd-cpp on ${opts.port} did not start`);
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
    return instance;
  }

  /** Stop a specific instance by type + port */
  async stop(instance: ServerInstance): Promise<void> {
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
    for (const instance of this.instances) {
      await this.stop(instance);
    }
  }

  /** Start periodic health checks on all managed servers */
  startLivenessProbes(): void {
    if (this.probeTimer) return;
    this.probeTimer = setInterval(async () => {
      try {
        await this.checkAllLiveliness();
      } catch {}
    }, this.PROBE_INTERVAL_MS);
  }

  /** Stop periodic health checks */
  stopLivenessProbes(): void {
    if (!this.probeTimer) return;
    clearInterval(this.probeTimer);
    this.probeTimer = null;
  }
}
