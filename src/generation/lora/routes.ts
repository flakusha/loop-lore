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
import { extractAuth, jsonResponse, } from "../../routes/http-utils";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import {
  clearDiscoveryCache,
  discoverAllLoras,
  discoverLoras,
  getCachedLoras,
  getCacheStatus,
} from "./discovery";
import { validateLoRAConfig, } from "./validation";

// ── Validation Schemas ───────────────────────────────────

const DiscoverBody = t.Object({
  backend: t.Optional(t.UnionEnum(["comfyui", "sd-server",],),),
  baseUrl: t.Optional(t.String(),),
  forceRefresh: t.Optional(t.Boolean(),),
},);

const ListQuery = t.Object({
  backend: t.Optional(t.UnionEnum(["comfyui", "sd-server",],),),
  search: t.Optional(t.String(),),
},);

const ClearCacheBody = t.Object({
  backend: t.Optional(t.UnionEnum(["comfyui", "sd-server",],),),
},);

const ValidateBody = t.Object({
  name: t.String({ minLength: 1, },),
  strength: t.Number({ minimum: 0.1, maximum: 1, },),
  backend: t.UnionEnum(["comfyui", "sd-server",],),
},);

// ── URL Resolution ───────────────────────────────────────

/**
 * Resolve backend base URLs from config by apiFamily.
 *
 * A single `sd[]` provider array can hold multiple image backends (ComfyUI,
 * sd.cpp/SD WebUI). `pickSdProvider()` selects a single provider by purpose,
 * so it cannot resolve per-backend URLs. Here each backend is looked up by its
 * `apiFamily` field and falls back to a sensible localhost default.
 *
 * @param config - App config (may be undefined)
 * @returns Resolved backend URLs
 *
 * @example
 * ```ts
 * const { comfyUrl, sdServerUrl } = resolveBackendUrls(config);
 * ```
 */
export function resolveBackendUrls(config?: Config,): { comfyUrl: string; sdServerUrl: string } {
  const sdProviders = config?.generation?.providers?.sd ?? [];
  const comfyProvider = sdProviders.find((p,) => p.apiFamily === "comfyui");
  const sdServerProvider = sdProviders.find((p,) => p.apiFamily === "sdcpp");
  return {
    comfyUrl: comfyProvider?.baseUrl ?? "http://localhost:8188",
    sdServerUrl: sdServerProvider?.baseUrl ?? "http://localhost:9010",
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
      const { userId, } = extractAuth(ctx,);
      if (!userId) {
        return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED", }, 401,);
      }

      // TODO: Add admin role check when RBAC is implemented
      // const { userRole, } = extractAuth(ctx,);
      // if (userRole !== "admin") {
      //   return jsonResponse({ error: "Forbidden", code: "FORBIDDEN", }, 403,);
      // }

      const input = ctx.body;

      // Resolve backend URLs from config — find by apiFamily, not by purpose
      const { comfyUrl, sdServerUrl, } = resolveBackendUrls(config,);

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

      const allModels: import("./types").LoRAModel[] = [];
      const errors: string[] = [];
      for (const r of results) {
        for (const m of r.models) {
          allModels.push(m,);
        }
        if (r.error) {
          errors.push(r.error,);
        }
      }

      return jsonResponse({
        ok: errors.length === 0,
        models: allModels,
        results,
        errors: errors.length > 0 ? errors : undefined,
      },);
    }, {
      body: DiscoverBody,
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
      const { userId, } = extractAuth(ctx,);
      if (!userId) {
        return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED", }, 401,);
      }

      const params = ctx.query;
      const cached = getCachedLoras();
      const models: import("./types").LoRAModel[] = [];

      for (const m of cached) {
        // Filter by backend
        if (params.backend && m.backend !== params.backend) {
          continue;
        }

        // Filter by search term
        if (params.search) {
          const term = params.search.toLowerCase();
          const nameMatch = m.name.toLowerCase().includes(term,);
          const fileMatch = m.filename.toLowerCase().includes(term,);
          if (!nameMatch && !fileMatch) {
            continue;
          }
        }

        models.push(m,);
      }

      return jsonResponse({
        ok: true,
        count: models.length,
        models,
      },);
    }, {
      query: ListQuery,
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
      const { userId, } = extractAuth(ctx,);
      if (!userId) {
        return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED", }, 401,);
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
      const { userId, } = extractAuth(ctx,);
      if (!userId) {
        return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED", }, 401,);
      }

      // TODO: Add admin role check when RBAC is implemented
      // const { userRole, } = extractAuth(ctx,);
      // if (userRole !== "admin") {
      //   return jsonResponse({ error: "Forbidden", code: "FORBIDDEN", }, 403,);
      // }

      const input = ctx.body;
      clearDiscoveryCache(input.backend,);

      return jsonResponse({
        ok: true,
        cleared: input.backend ?? "all",
      },);
    }, {
      body: ClearCacheBody,
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
      const { userId, } = extractAuth(ctx,);
      if (!userId) {
        return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED", }, 401,);
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
      body: ValidateBody,
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
