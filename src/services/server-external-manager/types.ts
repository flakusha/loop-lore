// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Subprocess, } from "bun";
import type { HonkboxAutoStartConfig, LlamaCppAutoStartConfig, SdCppAutoStartConfig, } from "../../config/schema";
import type { Logger, } from "../../logger";

/** Launch config retained so supervision restarts via the same spawn path. */
export type ServerLaunch =
  | { kind: "llama-cpp"; opts: LlamaCppOptions }
  | { kind: "llama-swap"; opts: LlamaSwapOptions }
  | { kind: "sd-cpp"; opts: SdCppOptions }
  | { kind: "honkbox"; opts: HonkboxOptions };

/** */
export interface ServerInstance {
  type: "llama-cpp" | "llama-swap" | "sd-cpp" | "honkbox";
  process: Subprocess;
  port: number;
  pid: number;
  startedAt: number;
  /** Original launch config; absent on hand-built instances (restart unsupported). */
  launch?: ServerLaunch;
}

/** */
export type LlamaCppOptions = LlamaCppAutoStartConfig;
/** */
export type SdCppOptions = SdCppAutoStartConfig;

/** */
export interface LlamaSwapOptions {
  configPath: string;
  /** Proxy listen port for `--listen` (default: 8080). */
  listenPort?: number;
}

/** */
export interface HonkboxOptions extends Omit<HonkboxAutoStartConfig, "port"> {
  /** Bind port (config default: 9010). */
  port: number;
}

/** Per-instance supervision counters (in-memory only; reset on process restart). */
export interface SupervisionCounters {
  /** Consecutive probe misses; reset on success. */
  misses: number;
  /** Consecutive restart attempts spent; reset on success. */
  restarts: number;
  /** Cumulative restart attempts; a healthy probe never resets this. */
  totalRestarts: number;
  /** Earliest timestamp for the next restart attempt (backoff gate). */
  notBefore: number;
  /** Budget exhausted and escalated; suppresses all further restarts. */
  exhausted: boolean;
}

/** Context reported when the supervision budget is exhausted. */
export interface SupervisionFatalInfo {
  type: ServerInstance["type"];
  port?: number;
  pid?: number;
  consecutiveMisses: number;
  restartAttempts: number;
}

/**
 * Handle for the manager's mutable runtime state, threaded into the
 * dispatcher modules (starts / lifecycle) instead of relying on `this`.
 */
export interface ServerExternalHost {
  log: Logger;
  instances: ServerInstance[];
  probeTimer: ReturnType<typeof setInterval> | null;
  readonly PROBE_INTERVAL_MS: number;
  /** Per-instance supervision counters, keyed by `${type}:${port}`. */
  supervision?: Map<string, SupervisionCounters>;
  /** Test seam: observe the fatal escalation without process death. */
  onSupervisionFatal?: (info: SupervisionFatalInfo,) => void;
}
