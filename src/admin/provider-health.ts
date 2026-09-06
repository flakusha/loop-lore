// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Provider Health Cache
 *
 * Manages provider health status and model discovery.
 * Provides rescan capability and cached health results.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getProvider, listProviders, } from "../generation/providers/registry";
import type { ModelInfo, } from "../generation/providers/types";
import { getLogger, } from "../logger";
import { upsertModelCapabilities, } from "./model-capabilities";

/** Health status for a single provider. */
export interface ProviderHealthStatus {
  name: string;
  label: string;
  status: "healthy" | "unreachable" | "error";
  models: ModelInfo[];
  latencyMs?: number;
  lastChecked: string;
  error?: string;
}

const state = { cache: [] as ProviderHealthStatus[], };

/**
 * Scan all registered providers for health and model discovery.
 * Returns updated health cache. When db is provided, auto-populates
 * the model capabilities registry with discovered models.
 * @param db - Optional database instance for capabilities sync.
 * @returns Updated health cache.
 */
export async function scanAllProviders(db?: Kysely<DB>,): Promise<ProviderHealthStatus[]> {
  const providers = listProviders();
  getLogger().child({ module: "provider-health", },).info("Scanning providers", { count: providers.length, },);

  const promises: Promise<ProviderHealthStatus>[] = [];
  for (const p of providers) {
    promises.push((async () => {
      const provider = getProvider(p.name,);
      if (!provider) {
        return {
          name: p.name,
          label: p.capabilities.label,
          status: "error" as const,
          models: [],
          lastChecked: new Date().toISOString(),
          error: "Provider not found in registry",
        };
      }

      const [health, models,] = await Promise.allSettled([provider.healthCheck(), provider.listModels(),],);

      const healthResult = health.status === "fulfilled" ? health.value : null;
      const modelsResult = models.status === "fulfilled" ? models.value : [];

      return {
        name: p.name,
        label: p.capabilities.label,
        status: healthResult?.status === "ok" ? ("healthy" as const) : ("unreachable" as const),
        models: modelsResult,
        latencyMs: healthResult?.latencyMs,
        lastChecked: new Date().toISOString(),
        error: healthResult?.error ?? (health.status === "rejected" ? String(health.reason,) : undefined),
      };
    })(),);
  }

  const results = await Promise.allSettled(promises,);

  const updated: ProviderHealthStatus[] = [];
  for (const [i, r,] of results.entries()) {
    if (r.status === "fulfilled") {
      updated.push(r.value,);
    } else {
      updated.push({
        name: providers[i]!.name,
        label: providers[i]!.capabilities.label,
        status: "error",
        models: [],
        lastChecked: new Date().toISOString(),
        error: r.reason instanceof Error ? r.reason.message : "Unknown error",
      },);
    }
  }

  state.cache = updated;

  // Auto-populate model capabilities registry
  if (db) {
    for (const p of updated) {
      if (p.status === "healthy" && p.models.length > 0) {
        try {
          await upsertModelCapabilities(db, p.name, p.models,);
        } catch (error) {
          getLogger().child({ module: "provider-health", },).warn("Failed to upsert model capabilities", {
            provider: p.name,
            error: error instanceof Error ? error.message : String(error,),
          },);
        }
      }
    }
  }

  let healthy = 0;
  for (const p of updated) { if (p.status === "healthy") { healthy++; } }
  const failed = updated.length - healthy;
  if (failed > 0) {
    getLogger().child({ module: "provider-health", },).warn("Some providers unreachable", { healthy, failed, },);
  } else {
    getLogger().child({ module: "provider-health", },).info("All providers healthy", { count: healthy, },);
  }

  return updated;
}

/**
 * Get cached health status (without re-scanning).
 * @returns Cached health status list.
 */
export function getHealthCache(): ProviderHealthStatus[] {
  return state.cache;
}

/**
 * Reset the provider health cache to empty.
 * Primarily for test isolation between test cases.
 */
export function resetHealthCache(): void {
  state.cache = [];
}

/**
 * Get health for a single provider by name.
 * @param name - Provider name.
 * @returns Health status or undefined if not found.
 */
export function getProviderHealth(name: string,): ProviderHealthStatus | undefined {
  for (const p of state.cache) {
    if (p.name === name) { return p; }
  }
  return undefined;
}

/**
 * Check if any providers are unhealthy.
 * @returns True if any provider is not healthy.
 */
export function hasUnhealthyProviders(): boolean {
  for (const p of state.cache) {
    if (p.status !== "healthy") { return true; }
  }
  return false;
}

/**
 * Get list of unhealthy provider names.
 * @returns Names of unhealthy providers.
 */
export function getUnhealthyProviders(): string[] {
  const result: string[] = [];
  for (const p of state.cache) {
    if (p.status !== "healthy") { result.push(p.name,); }
  }
  return result;
}

/**
 * Serialize a provider health status for API responses.
 * @param p - Provider health status.
 * @returns Summary object for API.
 */
export function providerToSummary(p: ProviderHealthStatus,) {
  return {
    name: p.name,
    label: p.label,
    status: p.status,
    modelCount: p.models.length,
    latencyMs: p.latencyMs,
    error: p.error,
  };
}
