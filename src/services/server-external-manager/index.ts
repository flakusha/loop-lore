// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Logger, } from "../../logger";
import {
  killAllSync as killAllSyncDispatch,
  stop as stopDispatch,
  stopAll as stopAllDispatch,
} from "./lifecycle";
import {
  startLivenessProbes as startLivenessProbesDispatch,
  stopLivenessProbes as stopLivenessProbesDispatch,
} from "./probes";
import {
  startLlamaCpp as startLlamaCppDispatch,
  startLlamaSwap as startLlamaSwapDispatch,
} from "./start-llama";
import { startSdCpp as startSdCppDispatch, } from "./start-sd";
import type {
  LlamaCppOptions,
  LlamaSwapOptions,
  SdCppOptions,
  ServerExternalHost,
  ServerInstance,
} from "./types";

export type {
  LlamaCppOptions,
  LlamaSwapOptions,
  SdCppOptions,
  ServerInstance,
} from "./types";

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
 *
 * The method bodies live in sibling dispatcher modules (starts / lifecycle /
 * probes) threaded with an explicit `ServerExternalHost` handle. The class is
 * kept so callers can `new ServerExternalManager(logger)`.
 */
export class ServerExternalManager implements ServerExternalHost {
  instances: ServerInstance[] = [];
  log: Logger;
  probeTimer: ReturnType<typeof setInterval> | null = null;
  readonly PROBE_INTERVAL_MS = 30_000;

  /**
   * @param logger
   */
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
   * @param opts
   */
  async startLlamaCpp(opts: LlamaCppOptions,): Promise<ServerInstance | null> {
    return startLlamaCppDispatch(this, opts,);
  }

  /**
   * Start llama-swap proxy with a config file.
   * @param opts
   */
  async startLlamaSwap(opts: LlamaSwapOptions,): Promise<ServerInstance | null> {
    return startLlamaSwapDispatch(this, opts,);
  }

  /**
   * Start sd-server on given port.
   *
   * Supports two model loading modes:
   * - checkpoint (default): -m modelPath — standalone full model, no llm/vae needed
   * - diffusion: --diffusion-model modelPath — requires --llm (text encoder), --vae optional
   * @param opts
   */
  async startSdCpp(opts: SdCppOptions,): Promise<ServerInstance | null> {
    return startSdCppDispatch(this, opts,);
  }

  /**
   * Stop a specific instance by type + port
   * @param instance
   */
  async stop(instance: ServerInstance,): Promise<void> {
    return stopDispatch(this, instance,);
  }

  /** Stop all managed servers */
  async stopAll(): Promise<void> {
    return stopAllDispatch(this,);
  }

  /**
   * Synchronous kill of all instances — for process.on('exit') handler.
   * Does not await, does not log (no event loop).
   */
  killAllSync(): void {
    return killAllSyncDispatch(this,);
  }

  // ── Liveliness probing ───────────────────────────────────

  /**
   * Start periodic health checks on all managed servers.
   * Logs warning on first failure, error on repeated failures.
   */
  startLivenessProbes(): void {
    return startLivenessProbesDispatch(this,);
  }

  /** Stop periodic health checks */
  stopLivenessProbes(): void {
    return stopLivenessProbesDispatch(this,);
  }
}
