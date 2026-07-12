/**
 * Provider Health Cache
 *
 * Manages provider health status and model discovery.
 * Provides rescan capability and cached health results.
 */
import { listProviders, getProvider } from "../generation/providers/registry";
import { getLogger } from "../logger";

export interface ProviderHealthStatus {
  name: string;
  label: string;
  status: "healthy" | "unreachable" | "error";
  models: string[];
  latencyMs?: number;
  lastChecked: string;
  error?: string;
}

const state = { cache: [] as ProviderHealthStatus[] };

/**
 * Scan all registered providers for health and model discovery.
 * Returns updated health cache.
 */
export async function scanAllProviders(): Promise<ProviderHealthStatus[]> {
  const providers = listProviders();
  getLogger().child({ module: "provider-health" }).info("Scanning providers", { count: providers.length });

  const results = await Promise.allSettled(
    providers.map(async (p) => {
      const provider = getProvider(p.name);
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

      const [health, models] = await Promise.allSettled([provider.healthCheck(), provider.listModels()]);

      const healthResult = health.status === "fulfilled" ? health.value : null;
      const modelsResult = models.status === "fulfilled" ? models.value : [];

      return {
        name: p.name,
        label: p.capabilities.label,
        status: healthResult?.status === "ok" ? ("healthy" as const) : ("unreachable" as const),
        models: modelsResult,
        latencyMs: healthResult?.latencyMs,
        lastChecked: new Date().toISOString(),
        error: healthResult?.error ?? (health.status === "rejected" ? String(health.reason) : undefined),
      };
    }),
  );

  const updated = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          name: providers[i]!.name,
          label: providers[i]!.capabilities.label,
          status: "error" as const,
          models: [],
          lastChecked: new Date().toISOString(),
          error: r.reason instanceof Error ? r.reason.message : "Unknown error",
        },
  );

  state.cache = updated;

  const healthy = updated.filter((p) => p.status === "healthy").length;
  const failed = updated.length - healthy;
  if (failed > 0) {
    getLogger().child({ module: "provider-health" }).warn("Some providers unreachable", { healthy, failed });
  } else {
    getLogger().child({ module: "provider-health" }).info("All providers healthy", { count: healthy });
  }

  return updated;
}

/**
 * Get cached health status (without re-scanning).
 */
export function getHealthCache(): ProviderHealthStatus[] {
  return state.cache;
}

/**
 * Get health for a single provider by name.
 */
export function getProviderHealth(name: string): ProviderHealthStatus | undefined {
  return state.cache.find((p) => p.name === name);
}

/**
 * Check if any providers are unhealthy.
 */
export function hasUnhealthyProviders(): boolean {
  return state.cache.some((p) => p.status !== "healthy");
}

/**
 * Get list of unhealthy provider names.
 */
export function getUnhealthyProviders(): string[] {
  return state.cache.filter((p) => p.status !== "healthy").map((p) => p.name);
}

/**
 * Serialize a provider health status for API responses.
 */
export function providerToSummary(p: ProviderHealthStatus) {
  return {
    name: p.name,
    label: p.label,
    status: p.status,
    modelCount: p.models.length,
    latencyMs: p.latencyMs,
    error: p.error,
  };
}
