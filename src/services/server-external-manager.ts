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

import { spawn, type Subprocess, } from "bun";
import { load as parseYaml, } from "js-yaml";
import { readFileSync, } from "node:fs";
import { homedir, } from "node:os";
import { resolve, } from "node:path";
import { platform, } from "node:process";
import type { LlamaCppAutoStartConfig, SdCppAutoStartConfig, } from "../config/schema";
import type { Logger, } from "../logger";
import {
  BINARY_CANDIDATES,
  findBinary,
  isHuggingFaceRef,
  isPortFree,
  waitForHealth,
  waitForPort,
} from "./external-server-utils";

// ── Types ──────────────────────────────────────────────────

export interface ServerInstance {
  type: "llama-cpp" | "llama-swap" | "sd-cpp";
  process: Subprocess;
  port: number;
  pid: number;
  startedAt: number;
}

export type LlamaCppOptions = LlamaCppAutoStartConfig;
export type SdCppOptions = SdCppAutoStartConfig;

export interface LlamaSwapOptions {
  configPath: string;
}

export class ServerExternalManager {
  private instances: ServerInstance[] = [];
  private log: Logger;
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private readonly PROBE_INTERVAL_MS = 30_000;

  constructor(logger: Logger,) {
    this.log = logger.child({ module: "server-external", },);
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
  // ── Helper: expand ~ to home directory ─────────────────────
  private expandPath(path: string,): string {
    if (path.startsWith("~",)) {
      return `${homedir()}${path.slice(1,)}`;
    }
    return path;
  }

  /**
   * Start llama.cpp server on given port.
   * modelPath accepts local path (/path/to/model.gguf) or HuggingFace ID (org/repo:quant).
   * Skips (returns null) if binary not found or port unavailable.
   */
  async startLlamaCpp(opts: LlamaCppOptions,): Promise<ServerInstance | null> {
    const binary = findBinary("llama-cpp",);
    if (!binary) {
      this.log.warn("llama-server not found in PATH — skipping auto-start", {
        binaryCandidates: BINARY_CANDIDATES["llama-cpp"],
      },);
      return null;
    }
    if (!(await isPortFree(opts.port,))) {
      this.log.warn("Port in use — skipping llama-cpp auto-start", { port: opts.port, },);
      return null;
    }

    const isHF = isHuggingFaceRef(opts.modelPath,);
    const modelFlag = isHF ? "-hf" : "-m";
    const modelValue = isHF ? opts.modelPath : resolve(this.expandPath(opts.modelPath,),);
    this.log.info("Starting llama.cpp", { binary, port: opts.port, model: modelValue, isHF, },);

    const args: string[] = [
      binary,
      modelFlag,
      modelValue,
      "--port",
      String(opts.port,),
      "--host",
      "127.0.0.1",
      "--no-ui",
    ];

    // ── Model / hardware ───────────────────────────────────
    if (opts.alias) { args.push("--alias", opts.alias,); }
    args.push("--ctx-size", String(opts.ctxSize ?? 8192,),);
    if (opts.threads) { args.push("-t", String(opts.threads,),); }
    if (opts.nGpuLayers) { args.push("--gpu-layers", opts.nGpuLayers,); }
    if (opts.device) { args.push("--device", opts.device,); }
    if (opts.mlock) { args.push("--mlock",); }

    // ── KV cache ───────────────────────────────────────────
    if (opts.cacheTypeK) { args.push("-ctk", opts.cacheTypeK,); }
    if (opts.cacheTypeV) { args.push("-ctv", opts.cacheTypeV,); }
    if (opts.cacheTypeKD) { args.push("-ctkd", opts.cacheTypeKD,); }
    if (opts.cacheTypeVD) { args.push("-ctvd", opts.cacheTypeVD,); }
    if (opts.cacheRam) { args.push("--cache-ram", String(opts.cacheRam,),); }
    if (opts.flashAttn) { args.push("-fa", opts.flashAttn,); }
    if (opts.swaFull) { args.push("--swa-full",); }

    // ── Context scaling ────────────────────────────────────
    if (opts.ropeScaling) { args.push("--rope-scaling", opts.ropeScaling,); }
    if (opts.ropeScale) { args.push("--rope-scale", String(opts.ropeScale,),); }

    // ── Sampler defaults ───────────────────────────────────
    if (opts.temp !== undefined) { args.push("--temp", String(opts.temp,),); }
    if (opts.topK !== undefined) { args.push("--top-k", String(opts.topK,),); }
    if (opts.topP !== undefined) { args.push("--top-p", String(opts.topP,),); }
    if (opts.minP !== undefined) { args.push("--min-p", String(opts.minP,),); }
    if (opts.repeatPenalty !== undefined) { args.push("--repeat-penalty", String(opts.repeatPenalty,),); }

    // ── Server behavior ────────────────────────────────────
    if (opts.parallelRequests) { args.push("-np", String(opts.parallelRequests,),); }
    if (opts.fit) { args.push("--fit", "on",); }

    // ── Advanced ───────────────────────────────────────────
    if (opts.specType) { args.push("--spec-type", opts.specType,); }
    if (opts.specDraftNMin !== undefined) { args.push("--spec-draft-n-min", String(opts.specDraftNMin,),); }
    if (opts.specDraftNMax !== undefined) { args.push("--spec-draft-n-max", String(opts.specDraftNMax,),); }
    if (opts.reasoningBudget !== undefined) { args.push("--reasoning-budget", String(opts.reasoningBudget,),); }
    if (opts.jinja !== undefined && !opts.jinja) { args.push("--no-jinja",); }

    if (opts.extraArgs) { args.push(...opts.extraArgs,); }

    const proc = spawn({ cmd: args, stdout: "pipe", stderr: "pipe", },);

    const ready = await waitForHealth(`http://127.0.0.1:${opts.port}/health`, { timeoutMs: 120_000, },);
    if (!ready) {
      proc.kill();
      this.log.warn("llama-cpp did not become ready within timeout", { port: opts.port, },);
      return null;
    }

    const instance: ServerInstance = {
      type: "llama-cpp",
      process: proc,
      port: opts.port,
      pid: proc.pid,
      startedAt: Date.now(),
    };
    this.instances.push(instance,);
    this.log.info("llama.cpp ready", { port: opts.port, pid: proc.pid, },);
    return instance;
  }

  /**
   * Start llama-swap proxy with a config file.
   */
  async startLlamaSwap(opts: LlamaSwapOptions,): Promise<ServerInstance | null> {
    const binary = findBinary("llama-swap",);
    if (!binary) {
      this.log.warn("llama-swap not found in PATH — skipping auto-start",);
      return null;
    }

    const resolvedConfig = resolve(this.expandPath(opts.configPath,),);
    // llama-swap listens on `startPort` from its own config (default 8080).
    // The spawn command does not pass --port, so read the real port here.
    const port = this.resolveLlamaSwapPort(resolvedConfig,);
    this.log.info("Starting llama-swap", { binary, config: resolvedConfig, port, },);
    const proc = spawn({
      cmd: [binary, "--config", resolvedConfig, "--listen", `127.0.0.1:${port}`,],
      stdout: "pipe",
      stderr: "pipe",
    },);

    // Probe the actual listening port (llama-swap has no guaranteed /health route).
    const ready = await waitForPort(port, { timeoutMs: 30_000, },);
    if (!ready) {
      proc.kill();
      this.log.warn("llama-swap did not become ready within timeout", { port, },);
      return null;
    }

    const instance: ServerInstance = {
      type: "llama-swap",
      process: proc,
      port,
      pid: proc.pid,
      startedAt: Date.now(),
    };
    this.instances.push(instance,);
    this.log.info("llama-swap ready", { pid: proc.pid, port, },);
    return instance;
  }

  /**
   * Read `startPort` from a llama-swap config file.
   * llama-swap listens on this port (the spawn command does not override it).
   * Falls back to 8080 if the file is missing or unreadable.
   */
  private resolveLlamaSwapPort(configPath: string,): number {
    try {
      const content = readFileSync(configPath, "utf8",);
      const parsed = parseYaml(content,) as { startPort?: number } | null;
      if (parsed && typeof parsed.startPort === "number") {
        return parsed.startPort;
      }
    } catch (error) {
      this.log.warn("Could not read llama-swap config for port — defaulting to 8080", {
        config: configPath,
        error: error instanceof Error ? error.message : String(error,),
      },);
    }
    return 8080;
  }

  /**
   * Start sd-server on given port.
   *
   * Supports two model loading modes:
   * - checkpoint (default): -m modelPath — standalone full model, no llm/vae needed
   * - diffusion: --diffusion-model modelPath — requires --llm (text encoder), --vae optional
   */
  async startSdCpp(opts: SdCppOptions,): Promise<ServerInstance | null> {
    const binary = findBinary("sd-cpp",);
    if (!binary) {
      this.log.warn("sd-server not found in PATH — skipping auto-start",);
      return null;
    }
    if (!(await isPortFree(opts.port,))) {
      this.log.warn("Port in use — skipping sd-cpp auto-start", { port: opts.port, },);
      return null;
    }

    const modelType = opts.modelType ?? "checkpoint";
    const args: string[] = [binary, "--listen-port", String(opts.port,), "-l", "127.0.0.1",];

    // ── Model loading ─────────────────────────────────────
    const modelPath = this.expandPath(opts.modelPath,);
    if (modelType === "diffusion") {
      if (!opts.llmPath) {
        this.log.warn(
          "sd-cpp diffusion model missing llmPath — model may fail to load if it needs a text encoder",
        );
      }
      args.push("--diffusion-model", resolve(modelPath,),);
      if (opts.llmPath) { args.push("--llm", resolve(this.expandPath(opts.llmPath,),),); }
      if (opts.vaePath) { args.push("--vae", resolve(this.expandPath(opts.vaePath,),),); }
    } else {
      args.push("-m", resolve(modelPath,),);
    }

    // ── Text encoders ─────────────────────────────────────
    if (opts.clipLPath) { args.push("--clip_l", resolve(this.expandPath(opts.clipLPath,),),); }
    if (opts.clipGPath) { args.push("--clip_g", resolve(this.expandPath(opts.clipGPath,),),); }
    if (opts.t5xxlPath) { args.push("--t5xxl", resolve(this.expandPath(opts.t5xxlPath,),),); }

    // ── Model components ──────────────────────────────────
    if (opts.vaeFormat) { args.push("--vae-format", opts.vaeFormat,); }
    if (opts.controlNetPath) { args.push("--control-net", resolve(this.expandPath(opts.controlNetPath,),),); }
    if (opts.loraDir) { args.push("--lora-model-dir", resolve(this.expandPath(opts.loraDir,),),); }
    if (opts.taesdPath) { args.push("--taesd", resolve(this.expandPath(opts.taesdPath,),),); }
    if (opts.hiresUpscalersDir) {
      args.push("--hires-upscalers-dir", resolve(this.expandPath(opts.hiresUpscalersDir,),),);
    }
    if (opts.embdDir) { args.push("--embd-dir", resolve(this.expandPath(opts.embdDir,),),); }
    if (opts.photoMakerPath) { args.push("--photo-maker", resolve(this.expandPath(opts.photoMakerPath,),),); }
    if (opts.upscaleModelPath) { args.push("--upscale-model", resolve(this.expandPath(opts.upscaleModelPath,),),); }

    // ── Boolean flags (add only if true) ──────────────────
    if (opts.fa) { args.push("--fa",); }
    if (opts.diffusionFA) { args.push("--diffusion-fa",); }
    if (opts.vaeTiling) { args.push("--vae-tiling",); }
    if (opts.eagerLoad) { args.push("--eager-load",); }
    if (opts.offloadToCPU) { args.push("--offload-to-cpu",); }
    if (opts.streamLayers) { args.push("--stream-layers",); }
    if (opts.autoFit) { args.push("--auto-fit",); }

    // ── Value flags (add only if set) ─────────────────────
    if (opts.maxVram) { args.push("--max-vram", opts.maxVram,); }
    if (opts.backend) { args.push("--backend", opts.backend,); }
    if (opts.rng) { args.push("--rng", opts.rng,); }
    if (opts.samplerRng) { args.push("--sampler-rng", opts.samplerRng,); }
    if (opts.type) { args.push("--type", opts.type,); }
    if (opts.prediction) { args.push("--prediction", opts.prediction,); }
    if (opts.cacheMode) { args.push("--cache-mode", opts.cacheMode,); }
    if (opts.cacheOption) { args.push("--cache-option", opts.cacheOption,); }

    // ── Extra args ────────────────────────────────────────
    if (opts.extraArgs) { args.push(...opts.extraArgs,); }

    this.log.info("Starting sd-server", { binary, port: opts.port, modelType, model: opts.modelPath, },);
    const proc = spawn({
      cmd: args,
      stdout: "pipe",
      stderr: "pipe",
    },);

    // sd-server: no liveliness probe. Use TCP port + stdout detection.
    const portReady = await waitForPort(opts.port, { timeoutMs: 60_000, },);
    if (!portReady) {
      proc.kill();
      this.log.warn("sd-cpp did not start within timeout", { port: opts.port, },);
      return null;
    }

    const instance: ServerInstance = {
      type: "sd-cpp",
      process: proc,
      port: opts.port,
      pid: proc.pid,
      startedAt: Date.now(),
    };
    this.instances.push(instance,);
    this.log.info("sd-server ready", { port: opts.port, pid: proc.pid, modelType, },);
    return instance;
  }

  /** Stop a specific instance by type + port */
  async stop(instance: ServerInstance,): Promise<void> {
    this.log.info("Stopping server", { type: instance.type, pid: instance.pid, },);

    // On Windows, process.kill() uses terminate() which doesn't accept signal strings
    if (platform === "win32") {
      instance.process.kill();
    } else {
      instance.process.kill("SIGTERM",);
      // Wait briefly for graceful shutdown
      await new Promise((r,) => setTimeout(r, 500,));
      if (!instance.process.killed) {
        instance.process.kill("SIGKILL",);
      }
    }
    this.instances = this.instances.filter((i,) => i !== instance);
  }

  /** Stop all managed servers */
  async stopAll(): Promise<void> {
    this.stopLivenessProbes();
    this.log.info("Stopping all managed servers", { count: this.instances.length, },);
    for (const instance of this.instances) {
      await this.stop(instance,);
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
        // On Windows, omit signal string (only SIGTERM/SIGKILL supported)
        if (platform === "win32") {
          process.kill(instance.pid,);
        } else {
          process.kill(instance.pid, "SIGKILL",);
        }
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
    if (this.probeTimer) { return; }
    this.probeTimer = setInterval(() => {
      void (async () => {
        try {
          await this.checkAllLiveliness();
        } catch {
          /* liveness probe — non-critical */
        }
      })();
    }, this.PROBE_INTERVAL_MS,);
    this.log.debug("Liveliness probes started", { intervalMs: this.PROBE_INTERVAL_MS, },);
  }

  /** Stop periodic health checks */
  stopLivenessProbes(): void {
    if (!this.probeTimer) {
      return;
    }

    clearInterval(this.probeTimer,);
    this.probeTimer = null;
    this.log.debug("Liveliness probes stopped",);
  }

  /** Run a single liveness check against all managed instances */
  private async checkAllLiveliness(): Promise<void> {
    for (const instance of this.instances) {
      const alive = await this.probeInstance(instance,);
      if (!alive) {
        this.log.warn("External server unresponsive", {
          type: instance.type,
          port: instance.pid,
          pid: instance.pid,
        },);
      }
    }
  }

  /** Probe a single instance — returns true if responsive */
  private async probeInstance(instance: ServerInstance,): Promise<boolean> {
    try {
      if (instance.type === "llama-cpp") {
        const res = await fetch(`http://127.0.0.1:${instance.port}/health`, {
          signal: AbortSignal.timeout(5000,),
        },);
        return res.ok;
      }
      if (instance.type === "llama-swap") {
        // No guaranteed /health route; probe the OpenAI models endpoint.
        await fetch(`http://127.0.0.1:${instance.port}/v1/models`, {
          signal: AbortSignal.timeout(5000,),
        },);
        return true;
      }
      // sd-cpp: any TCP response = alive
      await fetch(`http://127.0.0.1:${instance.port}/`, {
        signal: AbortSignal.timeout(5000,),
      },);
      return true;
    } catch {
      return false;
    }
  }
}
