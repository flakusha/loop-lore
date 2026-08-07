/**
 * LoRA Discovery
 *
 * Unified LoRA discovery across multiple backends (sd.cpp, ComfyUI).
 * Provides caching and error handling for production use.
 *
 * @module generation/lora/discovery
 */

import { discoverComfyUILoras, } from "./discovery-comfyui";
import { discoverSdCppLoras, } from "./discovery-sdserver";
import type { LoRADiscoveryResult, LoRAModel, } from "./types";

// ── Cache ────────────────────────────────────────────────

interface CacheEntry {
  result: LoRADiscoveryResult;
  expiresAt: number;
}

/** Discovery cache (backend → result) */
const discoveryCache = new Map<string, CacheEntry>();

/** Default cache TTL (5 minutes) */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

// ── Discovery Functions ──────────────────────────────────

/**
 * Discover LoRA models from a specific backend.
 *
 * @param backend - Backend to query ("comfyui" | "sd-server")
 * @param baseUrl - Backend server base URL
 * @param options - Discovery options
 * @returns Discovery result with available LoRA models
 *
 * @example
 * ```ts
 * const result = await discoverLoras("comfyui", "http://localhost:8188");
 * console.log("Found", result.models.length, "LoRA models");
 * ```
 */
export async function discoverLoras(
  backend: "comfyui" | "sd-server",
  baseUrl: string,
  options?: {
    timeoutMs?: number;
    forceRefresh?: boolean;
  },
): Promise<LoRADiscoveryResult> {
  const cacheKey = `${backend}:${baseUrl}`;
  const ttl = options?.timeoutMs ?? DEFAULT_CACHE_TTL_MS;

  // Check cache (unless forced refresh)
  if (!options?.forceRefresh) {
    const cached = discoveryCache.get(cacheKey,);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  // Perform discovery
  let result: LoRADiscoveryResult;

  switch (backend) {
    case "comfyui": {
      result = await discoverComfyUILoras(baseUrl, options?.timeoutMs,);
      break;
    }
    case "sd-server": {
      result = await discoverSdCppLoras(baseUrl, options?.timeoutMs,);
      break;
    }
    default: {
      result = {
        models: [],
        backend,
        timestamp: Date.now(),
        error: `Unknown backend: ${backend as string}`,
      };
    }
  }

  // Cache successful results
  if (!result.error) {
    discoveryCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + ttl,
    },);
  }

  return result;
}

/**
 * Discover LoRA models from all configured backends.
 *
 * @param backends - Array of backend configurations
 * @param options - Discovery options
 * @returns Combined discovery results
 *
 * @example
 * ```ts
 * const results = await discoverAllLoras([
 *   { backend: "comfyui", baseUrl: "http://localhost:8188" },
 *   { backend: "sd-server", baseUrl: "http://localhost:9010" },
 * ]);
 * ```
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
 *
 * @returns Array of cached LoRA models
 */
export function getCachedLoras(): LoRAModel[] {
  const models: LoRAModel[] = [];
  const now = Date.now();

  for (const entry of discoveryCache.values()) {
    if (entry.expiresAt > now) {
      models.push(...entry.result.models,);
    }
  }

  return models;
}

/**
 * Clear the LoRA discovery cache.
 *
 * @param backend - Optional backend to clear (clears all if omitted)
 */
export function clearDiscoveryCache(backend?: "comfyui" | "sd-server",): void {
  if (backend) {
    for (const key of discoveryCache.keys()) {
      if (key.startsWith(`${backend}:`,)) {
        discoveryCache.delete(key,);
      }
    }
  } else {
    discoveryCache.clear();
  }
}

/**
 * Get cache status for debugging.
 *
 * @returns Cache entry count and expiration info
 */
export function getCacheStatus(): { entries: number; nextExpiration: number | null } {
  let nextExpiration: number | null = null;

  for (const entry of discoveryCache.values()) {
    if (nextExpiration === null || entry.expiresAt < nextExpiration) {
      nextExpiration = entry.expiresAt;
    }
  }

  return {
    entries: discoveryCache.size,
    nextExpiration,
  };
}
