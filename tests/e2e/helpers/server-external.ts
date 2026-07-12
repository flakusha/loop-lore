/**
 * Server External Manager for E2E Tests
 *
 * Simplified version of the production ServerExternalManager.
 * Uses shared utilities from the production codebase but keeps
 * simplified start methods with shorter timeouts and fewer args.
 * Tests are skipped (not failed) when binaries or models are missing.
 */

import { spawn } from "bun";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Logger } from "../../../src/logger";
import type { LlamaCppAutoStartConfig, SdCppAutoStartConfig } from "../../../src/config/schema";
import {
  findBinary,
  isPortFree,
  isHuggingFaceRef,
  waitForHealth,
  waitForPort,
} from "../../../src/services/external-server-utils";
import type { ServerInstance } from "../../../src/services/server-external-manager";

// ── Types ──────────────────────────────────────────────────

export type LlamaCppOptions = Pick<
  LlamaCppAutoStartConfig,
  "port" | "modelPath" | "ctxSize" | "extraArgs"
>;

export interface LlamaSwapOptions {
  configPath: string;
}

export type SdCppOptions = Pick<
  SdCppAutoStartConfig,
  "port" | "modelPath" | "llmPath" | "vaePath" | "loraDir" | "extraArgs"
>;

export type { ServerInstance } from "../../../src/services/server-external-manager";

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
   * Start llama.cpp server on given port (simplified test version).
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

    const expandedPath = opts.configPath.startsWith("~") ? join(homedir(), opts.configPath.slice(1)) : opts.configPath;
    const resolvedConfig = resolve(expandedPath);
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
   * Start sd-server on given port (simplified test version).
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