// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Subprocess, } from "bun";
import type { LlamaCppAutoStartConfig, SdCppAutoStartConfig, } from "../../config/schema";
import type { Logger, } from "../../logger";

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

/**
 * Handle for the manager's mutable runtime state, threaded into the
 * dispatcher modules (starts / lifecycle) instead of relying on `this`.
 */
export interface ServerExternalHost {
  log: Logger;
  instances: ServerInstance[];
  probeTimer: ReturnType<typeof setInterval> | null;
  readonly PROBE_INTERVAL_MS: number;
}
