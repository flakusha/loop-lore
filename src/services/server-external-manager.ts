/**
 * Server External Manager — spawns external AI servers as child processes.
 *
 * Supports llama.cpp (llama-server/llama-server-vk) and sd.cpp (sd-server).
 * Each server type has its own lifecycle: start → health-check → ready → stop.
 *
 * Usage:
 *   const manager = new ServerExternalManager(logger);
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
  // ── Model / hardware ───────────────────────────────────
  alias?: string;
  ctxSize?: number;
  threads?: number;
  nGpuLayers?: string;
  device?: string;
  mlock?: boolean;
  // ── KV cache ───────────────────────────────────────────
  cacheTypeK?: string;
  cacheTypeV?: string;
  cacheRam?: number;
  flashAttn?: string;
  swaFull?: boolean;
  // ── Context scaling ────────────────────────────────────
  ropeScaling?: string;
  ropeScale?: number;
  // ── Sampler defaults ───────────────────────────────────
  temp?: number;
  topK?: number;
  topP?: number;
  minP?: number;
  repeatPenalty?: number;
  // ── Server behavior ────────────────────────────────────
  parallelRequests?: number;
  fit?: boolean;
  // ── Advanced ───────────────────────────────────────────
  specType?: string;
  specDraftNMin?: number;
  specDraftNMax?: number;
  reasoningBudget?: number;
  jinja?: boolean;
  // ── Extra ───────────────────────────────────────────────
  extraArgs?: string[];
}

export interface LlamaSwapOptions {
  configPath: string;
}

export interface SdCppOptions {
  port: number;
  modelPath: string;
  /** "checkpoint" = full model (-m), "diffusion" = component model (--diffusion-model) */
  modelType?: "checkpoint" | "diffusion";
  // ── Text encoders ───────────────────────────────────────
  llmPath?: string;
  clipLPath?: string;
  clipGPath?: string;
  t5xxlPath?: string;
  // ── Model components ────────────────────────────────────
  vaePath?: string;
  vaeFormat?: string;
  controlNetPath?: string;
  loraDir?: string;
  taesdPath?: string;
  hiresUpscalersDir?: string;
  embdDir?: string;
  photoMakerPath?: string;
  upscaleModelPath?: string;
  // ── Boolean flags ───────────────────────────────────────
  fa?: boolean;
  diffusionFA?: boolean;
  vaeTiling?: boolean;
  eagerLoad?: boolean;
  offloadToCPU?: boolean;
  streamLayers?: boolean;
  autoFit?: boolean;
  // ── Value flags ─────────────────────────────────────────
  maxVram?: string;
  backend?: string;
  rng?: string;
  samplerRng?: string;
  type?: string;
  prediction?: string;
  cacheMode?: string;
  cacheOption?: string;
  // ── Extra ───────────────────────────────────────────────
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
    void server.stop();
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

async function waitForHealth(url: string, opts: WaitForHealthOptions): Promise<boolean> {
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
async function waitForStdout(proc: Subprocess, opts: WaitForStdoutOptions): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs;
  const stdout = proc.stdout;
  if (!stdout || typeof stdout === "number") return false;
  const reader = stdout.getReader();

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

  /** All running server instances */
  get active(): readonly ServerInstance[] {
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

    const args: string[] = [
      binary,
      modelFlag,
      modelValue,
      "--port",
      String(opts.port),
      "--host",
      "127.0.0.1",
      "--no-ui",
    ];

    // ── Model / hardware ───────────────────────────────────
    if (opts.alias) args.push("--alias", opts.alias);
    args.push("--ctx-size", String(opts.ctxSize ?? 8192));
    if (opts.threads) args.push("-t", String(opts.threads));
    if (opts.nGpuLayers) args.push("--gpu-layers", opts.nGpuLayers);
    if (opts.device) args.push("--device", opts.device);
    if (opts.mlock) args.push("--mlock");

    // ── KV cache ───────────────────────────────────────────
    if (opts.cacheTypeK) args.push("-ctk", opts.cacheTypeK);
    if (opts.cacheTypeV) args.push("-ctv", opts.cacheTypeV);
    if (opts.cacheRam) args.push("--cache-ram", String(opts.cacheRam));
    if (opts.flashAttn) args.push("-fa", opts.flashAttn);
    if (opts.swaFull) args.push("--swa-full");

    // ── Context scaling ────────────────────────────────────
    if (opts.ropeScaling) args.push("--rope-scaling", opts.ropeScaling);
    if (opts.ropeScale) args.push("--rope-scale", String(opts.ropeScale));

    // ── Sampler defaults ───────────────────────────────────
    if (opts.temp !== undefined) args.push("--temp", String(opts.temp));
    if (opts.topK !== undefined) args.push("--top-k", String(opts.topK));
    if (opts.topP !== undefined) args.push("--top-p", String(opts.topP));
    if (opts.minP !== undefined) args.push("--min-p", String(opts.minP));
    if (opts.repeatPenalty !== undefined) args.push("--repeat-penalty", String(opts.repeatPenalty));

    // ── Server behavior ────────────────────────────────────
    if (opts.parallelRequests) args.push("-np", String(opts.parallelRequests));
    if (opts.fit) args.push("--fit", "on");

    // ── Advanced ───────────────────────────────────────────
    if (opts.specType) args.push("--spec-type", opts.specType);
    if (opts.specDraftNMin !== undefined) args.push("--spec-draft-n-min", String(opts.specDraftNMin));
    if (opts.specDraftNMax !== undefined) args.push("--spec-draft-n-max", String(opts.specDraftNMax));
    if (opts.reasoningBudget !== undefined) args.push("--reasoning-budget", String(opts.reasoningBudget));
    if (opts.jinja !== undefined && !opts.jinja) args.push("--no-jinja");

    if (opts.extraArgs) args.push(...opts.extraArgs);

    const proc = spawn({ cmd: args, stdout: "pipe", stderr: "pipe" });

    const ready = await waitForHealth(`http://127.0.0.1:${opts.port}/health`, { timeoutMs: 120_000 });
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
    const ready = await waitForHealth("http://127.0.0.1:8080/health", { timeoutMs: 30_000 });
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
   *
   * Supports two model loading modes:
   * - checkpoint (default): -m modelPath — standalone full model, no llm/vae needed
   * - diffusion: --diffusion-model modelPath — requires --llm (text encoder), --vae optional
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

    const modelType = opts.modelType ?? "checkpoint";
    const args: string[] = [binary, "--listen-port", String(opts.port), "-l", "127.0.0.1"];

    // ── Model loading ─────────────────────────────────────
    if (modelType === "diffusion") {
      if (!opts.llmPath) {
        this.log.warn(
          "sd-cpp diffusion model missing llmPath — model may fail to load if it needs a text encoder",
        );
      }
      args.push("--diffusion-model", resolve(opts.modelPath));
      if (opts.llmPath) args.push("--llm", resolve(opts.llmPath));
      if (opts.vaePath) args.push("--vae", resolve(opts.vaePath));
    } else {
      args.push("-m", resolve(opts.modelPath));
    }

    // ── Text encoders ─────────────────────────────────────
    if (opts.clipLPath) args.push("--clip_l", resolve(opts.clipLPath));
    if (opts.clipGPath) args.push("--clip_g", resolve(opts.clipGPath));
    if (opts.t5xxlPath) args.push("--t5xxl", resolve(opts.t5xxlPath));

    // ── Model components ──────────────────────────────────
    if (opts.vaeFormat) args.push("--vae-format", opts.vaeFormat);
    if (opts.controlNetPath) args.push("--control-net", resolve(opts.controlNetPath));
    if (opts.loraDir) args.push("--lora-model-dir", resolve(opts.loraDir));
    if (opts.taesdPath) args.push("--taesd", resolve(opts.taesdPath));
    if (opts.hiresUpscalersDir) args.push("--hires-upscalers-dir", resolve(opts.hiresUpscalersDir));
    if (opts.embdDir) args.push("--embd-dir", resolve(opts.embdDir));
    if (opts.photoMakerPath) args.push("--photo-maker", resolve(opts.photoMakerPath));
    if (opts.upscaleModelPath) args.push("--upscale-model", resolve(opts.upscaleModelPath));

    // ── Boolean flags (add only if true) ──────────────────
    if (opts.fa) args.push("--fa");
    if (opts.diffusionFA) args.push("--diffusion-fa");
    if (opts.vaeTiling) args.push("--vae-tiling");
    if (opts.eagerLoad) args.push("--eager-load");
    if (opts.offloadToCPU) args.push("--offload-to-cpu");
    if (opts.streamLayers) args.push("--stream-layers");
    if (opts.autoFit) args.push("--auto-fit");

    // ── Value flags (add only if set) ─────────────────────
    if (opts.maxVram) args.push("--max-vram", opts.maxVram);
    if (opts.backend) args.push("--backend", opts.backend);
    if (opts.rng) args.push("--rng", opts.rng);
    if (opts.samplerRng) args.push("--sampler-rng", opts.samplerRng);
    if (opts.type) args.push("--type", opts.type);
    if (opts.prediction) args.push("--prediction", opts.prediction);
    if (opts.cacheMode) args.push("--cache-mode", opts.cacheMode);
    if (opts.cacheOption) args.push("--cache-option", opts.cacheOption);

    // ── Extra args ────────────────────────────────────────
    if (opts.extraArgs) args.push(...opts.extraArgs);

    this.log.info("Starting sd-server", { binary, port: opts.port, modelType, model: opts.modelPath });
    const proc = spawn({
      cmd: args,
      stdout: "pipe",
      stderr: "pipe",
    });

    // sd-server: no liveliness probe. Use TCP port + stdout detection.
    const portReady = await waitForPort(opts.port, { timeoutMs: 60_000 });
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
    this.log.info("sd-server ready", { port: opts.port, pid: proc.pid, modelType });
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
    this.stopLivenessProbes();
    this.log.info("Stopping all managed servers", { count: this.instances.length });
    for (const instance of this.instances) {
      await this.stop(instance);
    }
  }

  /**
   * Synchronous kill of all instances — for process.on('exit') handler.
   * Does not await, does not log (no event loop).
   */
  killAllSync(): void {
    this.stopLivenessProbes();
    for (const instance of this.instances) {
      try {
        process.kill(instance.pid, "SIGKILL");
      } catch {
        // already dead — ignore
      }
    }
    this.instances.length = 0;
  }

  // ── Liveliness probing ───────────────────────────────────

  /**
   * Start periodic health checks on all managed servers.
   * Logs warning on first failure, error on repeated failures.
   */
  startLivenessProbes(): void {
    if (this.probeTimer) return;
    this.probeTimer = setInterval(() => {
      this.checkAllLiveliness().catch(() => {});
    }, this.PROBE_INTERVAL_MS);
    this.log.debug("Liveliness probes started", { intervalMs: this.PROBE_INTERVAL_MS });
  }

  /** Stop periodic health checks */
  stopLivenessProbes(): void {
    if (!this.probeTimer) {
      return;
    }

    clearInterval(this.probeTimer);
    this.probeTimer = null;
    this.log.debug("Liveliness probes stopped");
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
}
