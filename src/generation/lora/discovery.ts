// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LoRA Discovery
 *
 * Unified LoRA discovery across multiple backends (sd.cpp, ComfyUI).
 * Provides caching and error handling for production use.
 * @module generation/lora/discovery
 */

import {
  cachedDiscovery,
  cachedValues,
  clearCachedDiscovery,
  DISCOVERY_TTL_MS,
  getCacheStatus as getSharedCacheStatus,
} from "../discovery-cache";
import { discoverComfyUILoras, } from "./discovery-comfyui";
import { discoverSdCppLoras, } from "./discovery-sdserver";
import type { LoRADiscoveryResult, LoRAModel, } from "./types";

// ── Discovery Functions ──────────────────────────────────

/**
 * Discover LoRA models from a specific backend.
 * @param backend - Backend to query ("comfyui" | "sd-server")
 * @param baseUrl - Backend server base URL
 * @param options - Discovery options
 * @param options.timeoutMs
 * @param options.forceRefresh
 * @returns Discovery result with available LoRA models
 */
export async function discoverLoras(
  backend: "comfyui" | "sd-server",
  baseUrl: string,
  options?: {
    timeoutMs?: number;
    forceRefresh?: boolean;
  },
): Promise<LoRADiscoveryResult> {
  return cachedDiscovery<LoRADiscoveryResult>(
    `${backend}:${baseUrl}`,
    async () => {
      switch (backend) {
        case "comfyui": {
          return discoverComfyUILoras(baseUrl, options?.timeoutMs,);
        }

        case "sd-server": {
          return discoverSdCppLoras(baseUrl, options?.timeoutMs,);
        }

        default: {
          return {
            models: [],
            backend,
            timestamp: Date.now(),
            error: `Unknown backend: ${backend as string}`,
          };
        }
      }
    },
    {
      ttlMs: options?.timeoutMs ?? DISCOVERY_TTL_MS,
      forceRefresh: options?.forceRefresh,
      shouldCache: (result,) => !result.error,
    },
  );
}

/**
 * Discover LoRA models from all configured backends.
 * @param backends - Array of backend configurations
 * @param options - Discovery options
 * @param options.timeoutMs
 * @param options.forceRefresh
 * @returns Combined discovery results
 */
export async function discoverAllLoras(
  backends: { backend: "comfyui" | "sd-server"; baseUrl: string }[],
  options?: {
    timeoutMs?: number;
    forceRefresh?: boolean;
  },
): Promise<LoRADiscoveryResult[]> {
  // Use allSettled: each discoverLoras returns a result (errors encoded in the
  // result), so partial failures are collected rather than aborting.
  const settled = await Promise.allSettled(
    Array.from(backends, ({ backend, baseUrl, },) => discoverLoras(backend, baseUrl, options,),),
  );

  const results: LoRADiscoveryResult[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") { results.push(r.value,); }
  }

  return results;
}

/**
 * Get all cached LoRA models across all backends.
 * @returns Array of cached LoRA models
 */
export function getCachedLoras(): LoRAModel[] {
  return [
    ...cachedValues<LoRADiscoveryResult>("comfyui:",),
    ...cachedValues<LoRADiscoveryResult>("sd-server:",),
  ].flatMap((result,) => result.models);
}

/**
 * Clear the LoRA discovery cache.
 * @param backend - Optional backend to clear (clears all if omitted)
 * @returns {void}
 */
export function clearDiscoveryCache(backend?: "comfyui" | "sd-server",): void {
  clearCachedDiscovery(backend ? `${backend}:` : undefined,);
}

/**
 * Get cache status for debugging.
 * @returns Cache entry count and expiration info
 */
export function getCacheStatus(): { entries: number; nextExpiration: number | null } {
  return getSharedCacheStatus();
}
