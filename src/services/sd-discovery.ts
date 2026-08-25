// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * SD Backend Auto-Discovery
 *
 * Probes well-known ports for running SD backends when no configuration is provided.
 * This allows loop-lore to discover and use already-running SD servers without manual config.
 *
 * Known ports:
 * - 1234: sd-server (stable-diffusion.cpp / sd.cpp)
 * - 8188: ComfyUI
 */

import type { ImageProviderConfig, } from "../config/schema";
import type { ImageApiFamily, } from "../db/enums-config";
import { getLogger, } from "../logger";
import { safeFetch, } from "../utils";

/** Lazy logger — avoids top-level init-order crash */
function log() {
  return getLogger().child({ module: "sd-discovery", },);
}

export interface DiscoveredBackend {
  /** API family */
  apiFamily: ImageApiFamily;
  /** Base URL of the discovered backend */
  baseUrl: string;
  /** Human-readable label */
  label: string;
}

export interface DiscoveryOptions {
  /** Timeout for each probe in milliseconds (default: 2000) */
  timeoutMs?: number;
}

const WELL_KNOWN_PORTS: { port: number; apiFamily: ImageApiFamily; label: string; healthPath: string }[] = [
  {
    port: 1234,
    apiFamily: "sdapi",
    label: "sd-server (auto-discovered)",
    healthPath: "/sdapi/v1/samplers",
  },
  {
    port: 8188,
    apiFamily: "comfyui",
    label: "ComfyUI (auto-discovered)",
    healthPath: "/object_info",
  },
];

/**
 * Probe a single backend endpoint.
 * Returns true if the backend is responding and healthy.
 */
async function probeBackend(
  baseUrl: string,
  healthPath: string,
  timeoutMs: number,
): Promise<boolean> {
  const url = `${baseUrl}${healthPath}`;
  const result = await safeFetch(url, { timeout: timeoutMs, },);
  return result.ok;
}

/**
 * Probe a well-known port for an SD backend.
 * Returns the backend info if healthy, null otherwise.
 */
async function probePort(
  entry: (typeof WELL_KNOWN_PORTS)[number],
  timeoutMs: number,
): Promise<DiscoveredBackend | null> {
  const baseUrl = `http://127.0.0.1:${entry.port}`;
  const healthy = await probeBackend(baseUrl, entry.healthPath, timeoutMs,);
  if (!healthy) {
    return null;
  }

  log().info({ message: "Discovered SD backend", apiFamily: entry.apiFamily, baseUrl, },);

  return {
    apiFamily: entry.apiFamily,
    baseUrl,
    label: entry.label,
  };
}

/**
 * Discover running SD backends by probing well-known ports.
 *
 * @param options - Discovery options
 * @returns Array of discovered backends
 */
export async function discoverBackends(options?: DiscoveryOptions,): Promise<DiscoveredBackend[]> {
  const timeoutMs = options?.timeoutMs ?? 2000;
  const discovered: DiscoveredBackend[] = [];

  const results = await Promise.allSettled(
    Array.from(WELL_KNOWN_PORTS, (entry,) => probePort(entry, timeoutMs,),),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      discovered.push(result.value,);
    }
  }

  if (discovered.length === 0) {
    log().debug({ message: "No SD backends discovered on well-known ports", },);
  }

  return discovered;
}

/**
 * Convert a DiscoveredBackend to an ImageProviderConfig.
 */
export function backendToConfig(backend: DiscoveredBackend, name: string,): ImageProviderConfig {
  return {
    name,
    label: backend.label,
    baseUrl: backend.baseUrl,
    apiFamily: backend.apiFamily,
    purpose: "both",
    defaults: {
      width: 512,
      height: 512,
      steps: 20,
      cfgScale: 7,
      sampler: "euler",
    },
    timeout: 30_000,
    generationTimeout: 120_000,
  };
}
