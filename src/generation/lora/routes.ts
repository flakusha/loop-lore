/**
 * LoRA API Routes
 *
 * REST API endpoints for LoRA discovery and management.
 * TODO: Wire routes into elysia-app.ts when LoRA feature is ready for production.
 *
 * Routes:
 *   POST /api/lora/discover - Trigger LoRA discovery for a backend
 *   GET  /api/lora/list     - List cached LoRA models
 *   GET  /api/lora/status   - Get discovery cache status
 *   POST /api/lora/clear    - Clear discovery cache
 *   POST /api/lora/validate - Validate LoRA config
 *
 * @module generation/lora/routes
 */

import { Elysia, t, } from "elysia";
import type { Config, } from "../../config/schema";
import { pickSdProvider, } from "../../config/schema";
import { jsonResponse, } from "../../routes/http-utils";
import { unauthorized, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
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

// ── Elysia Plugin ────────────────────────────────────────

/**
 * LoRA routes plugin.
 *
 * TODO: Register in elysia-app.ts when LoRA feature is ready for production.
 * All LoRA routes are gated behind auth check.
 */
export function loraRoutes({ config, }: { config: Config },) {
  return new Elysia({ name: "lora", },)

    // POST /api/lora/discover
    .post("/api/lora/discover", async (ctx,) => {
      const userId = (ctx as any).userId as string | null;
      if (!userId) {
        return unauthorized();
      }

      // TODO: Add admin role check when RBAC is implemented
      // const userRole = (ctx as any).userRole as string | null;
      // if (userRole !== "admin") {
      //   return forbidden();
      // }

      const input = validateDiscoverBody(ctx.body,);
      if (!input) {
        return jsonResponse({ error: "Invalid request body", code: "BAD_REQUEST", },);
      }

      // Get backend URLs from config
      const sdProvider = pickSdProvider(config?.generation?.providers?.sd, "generate",);
      const comfyUrl = sdProvider?.baseUrl ?? "http://localhost:8188";
      const sdServerUrl = sdProvider?.baseUrl ?? "http://localhost:9010";

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
    }, {
      body: t.Object({
        backend: t.Optional(t.UnionEnum(["comfyui", "sd-server",],),),
        baseUrl: t.Optional(t.String(),),
        forceRefresh: t.Optional(t.Boolean(),),
      },),
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Discover LoRA models from a backend",
        description: "Triggers LoRA model discovery for a specific backend or all configured backends.",
        tags: ["LoRA",],
      },
    },)

    // GET /api/lora/list
    .get("/api/lora/list", (ctx,) => {
      const userId = (ctx as any).userId as string | null;
      if (!userId) {
        return unauthorized();
      }

      const params = parseListQuery(new URL(ctx.request.url,).searchParams,);
      let models = getCachedLoras();

      // Filter by backend
      if (params.backend) {
        models = models.filter((m,) => m.backend === params.backend,);
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
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "List cached LoRA models",
        description: "Returns cached LoRA models with optional backend and search filters.",
        tags: ["LoRA",],
      },
    },)

    // GET /api/lora/status
    .get("/api/lora/status", (ctx,) => {
      const userId = (ctx as any).userId as string | null;
      if (!userId) {
        return unauthorized();
      }

      const status = getCacheStatus();

      return jsonResponse({
        ok: true,
        ...status,
      },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Get LoRA discovery cache status",
        description: "Returns cache entry count and expiration info.",
        tags: ["LoRA",],
      },
    },)

    // POST /api/lora/clear
    .post("/api/lora/clear", (ctx,) => {
      const userId = (ctx as any).userId as string | null;
      if (!userId) {
        return unauthorized();
      }

      // TODO: Add admin role check when RBAC is implemented
      // const userRole = (ctx as any).userRole as string | null;
      // if (userRole !== "admin") {
      //   return forbidden();
      // }

      const input = validateClearCacheBody(ctx.body,);
      if (!input) {
        return jsonResponse({ error: "Invalid request body", code: "BAD_REQUEST", },);
      }

      clearDiscoveryCache(input.backend,);

      return jsonResponse({
        ok: true,
        cleared: input.backend ?? "all",
      },);
    }, {
      body: t.Object({
        backend: t.Optional(t.UnionEnum(["comfyui", "sd-server",],),),
      },),
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Clear LoRA discovery cache",
        description: "Clears cached discovery results for a specific backend or all backends.",
        tags: ["LoRA",],
      },
    },)

    // POST /api/lora/validate
    .post("/api/lora/validate", (ctx,) => {
      const userId = (ctx as any).userId as string | null;
      if (!userId) {
        return unauthorized();
      }

      const error = validateLoRAConfig(ctx.body,);

      if (error) {
        return jsonResponse({
          ok: false,
          error,
        },);
      }

      return jsonResponse({
        ok: true,
        config: ctx.body,
      },);
    }, {
      body: t.Object({
        name: t.String({ minLength: 1, },),
        strength: t.Number({ minimum: 0.1, maximum: 1.0, },),
        backend: t.UnionEnum(["comfyui", "sd-server",],),
      },),
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Validate LoRA configuration",
        description: "Validates a LoRA configuration object and returns any validation errors.",
        tags: ["LoRA",],
      },
    },);
}
