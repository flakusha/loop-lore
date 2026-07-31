/**
 * LoRA API Routes
 *
 * REST API endpoints for LoRA discovery and management.
 *
 * Routes:
 *   POST /api/lora/discover - Trigger LoRA discovery for a backend
 *   GET  /api/lora/list     - List cached LoRA models
 *   GET  /api/lora/status   - Get discovery cache status
 *
 * @module generation/lora/routes
 */

import type { Config, } from "../../config/schema";
import { jsonError, jsonResponse, } from "../../routes/http-utils";
import {
  clearDiscoveryCache,
  discoverAllLoras,
  discoverLoras,
  getCachedLoras,
  getCacheStatus,
} from "./discovery";
import { validateLoRAConfig, } from "./validation";

// ── Route: Discover LoRAs ────────────────────────────────

interface DiscoverBody {
  backend?: "comfyui" | "sd-server";
  baseUrl?: string;
  forceRefresh?: boolean;
}

function validateDiscoverBody(body: unknown,): DiscoverBody | null {
  if (!body || typeof body !== "object") { return null; }
  const b = body as Record<string, unknown>;

  // Validate backend if provided
  if (b.backend !== undefined && b.backend !== "comfyui" && b.backend !== "sd-server") {
    return null;
  }

  // Validate baseUrl if provided
  if (b.baseUrl !== undefined && typeof b.baseUrl !== "string") {
    return null;
  }

  // Validate forceRefresh if provided
  if (b.forceRefresh !== undefined && typeof b.forceRefresh !== "boolean") {
    return null;
  }

  return {
    backend: b.backend,
    baseUrl: b.baseUrl,
    forceRefresh: b.forceRefresh,
  };
}

/**
 * POST /api/lora/discover
 *
 * Trigger LoRA discovery for a specific backend or all backends.
 *
 * Body:
 *   { backend?: "comfyui" | "sd-server", baseUrl?: string, forceRefresh?: boolean }
 *
 * If backend is omitted, discovers from all configured backends.
 * If baseUrl is omitted, uses config defaults.
 */
export async function handleDiscoverLoras(
  body: unknown,
  config?: Config,
): Promise<Response> {
  const input = validateDiscoverBody(body,);

  if (!input) {
    return jsonError({ message: "Invalid request body", status: 400, },);
  }

  // Get backend URLs from config
  const comfyUrl = config?.generation?.providers?.sd?.baseUrl ?? "http://localhost:8188";
  const sdServerUrl = config?.generation?.providers?.sd?.baseUrl ?? "http://localhost:9010";

  if (input.backend) {
    // Discover from single backend
    const baseUrl = input.baseUrl ?? (input.backend === "comfyui" ? comfyUrl : sdServerUrl);
    const result = await discoverLoras(input.backend, baseUrl, {
      forceRefresh: input.forceRefresh,
    },);

    return jsonResponse({
      ok: !result.error,
      ...result,
    },);
  }

  // Discover from all backends
  const results = await discoverAllLoras([
    { backend: "comfyui", baseUrl: comfyUrl, },
    { backend: "sd-server", baseUrl: sdServerUrl, },
  ], {
    forceRefresh: input.forceRefresh,
  },);

  const allModels = results.flatMap((r,) => r.models);
  const errors = results.filter((r,) => r.error).map((r,) => r.error);

  return jsonResponse({
    ok: errors.length === 0,
    models: allModels,
    results,
    errors: errors.length > 0 ? errors : undefined,
  },);
}

// ── Route: List LoRAs ────────────────────────────────────

interface ListQueryParams {
  backend?: "comfyui" | "sd-server";
  search?: string;
}

function parseListQuery(searchParams: URLSearchParams,): ListQueryParams {
  const backend = searchParams.get("backend",);
  const search = searchParams.get("search",);

  return {
    backend: backend === "comfyui" || backend === "sd-server" ? backend : undefined,
    search: search ?? undefined,
  };
}

/**
 * GET /api/lora/list
 *
 * List cached LoRA models.
 *
 * Query params:
 *   backend? - Filter by backend ("comfyui" | "sd-server")
 *   search?  - Filter by name (substring match)
 */
export function handleListLoras(
  searchParams: URLSearchParams,
): Response {
  const params = parseListQuery(searchParams,);
  let models = getCachedLoras();

  // Filter by backend
  if (params.backend) {
    models = models.filter((m,) => m.backend === params.backend);
  }

  // Filter by search term
  if (params.search) {
    const term = params.search.toLowerCase();
    models = models.filter(
      (m,) => m.name.toLowerCase().includes(term,) || m.filename.toLowerCase().includes(term,),
    );
  }

  return jsonResponse({
    ok: true,
    count: models.length,
    models,
  },);
}

// ── Route: Cache Status ──────────────────────────────────

/**
 * GET /api/lora/status
 *
 * Get LoRA discovery cache status.
 */
export function handleLoRAStatus(): Response {
  const status = getCacheStatus();

  return jsonResponse({
    ok: true,
    ...status,
  },);
}

// ── Route: Clear Cache ───────────────────────────────────

interface ClearCacheBody {
  backend?: "comfyui" | "sd-server";
}

function validateClearCacheBody(body: unknown,): ClearCacheBody | null {
  if (!body || typeof body !== "object") { return null; }
  const b = body as Record<string, unknown>;

  if (b.backend !== undefined && b.backend !== "comfyui" && b.backend !== "sd-server") {
    return null;
  }

  return {
    backend: b.backend,
  };
}

/**
 * POST /api/lora/clear
 *
 * Clear the LoRA discovery cache.
 *
 * Body:
 *   { backend?: "comfyui" | "sd-server" }
 *
 * If backend is omitted, clears all caches.
 */
export function handleClearCache(body: unknown,): Response {
  const input = validateClearCacheBody(body,);

  if (!input) {
    return jsonError({ message: "Invalid request body", status: 400, },);
  }

  clearDiscoveryCache(input.backend,);

  return jsonResponse({
    ok: true,
    cleared: input.backend ?? "all",
  },);
}

// ── Route: Validate Config ───────────────────────────────

/**
 * POST /api/lora/validate
 *
 * Validate a LoRA configuration object.
 *
 * Body:
 *   { name: string, strength: number, backend: "comfyui" | "sd-server" }
 */
export function handleValidateConfig(body: unknown,): Response {
  const error = validateLoRAConfig(body,);

  if (error) {
    return jsonResponse({
      ok: false,
      error,
    },);
  }

  return jsonResponse({
    ok: true,
    config: body,
  },);
}
