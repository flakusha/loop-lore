// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { extractAuth, jsonResponse, } from "../../../routes/http-utils";
import { ErrorResponse, SuccessResponse, } from "../../../validation/schemas";
import { clearDiscoveryCache, getCachedLoras, getCacheStatus, } from "../discovery";

// ── Validation Schemas ─────────────────────────────────

const ListQuery = t.Object({
  backend: t.Optional(t.UnionEnum(["comfyui", "sd-server",],),),
  search: t.Optional(t.String(),),
},);

const ClearCacheBody = t.Object({
  backend: t.Optional(t.UnionEnum(["comfyui", "sd-server",],),),
},);

/** GET /api/lora/list, /status and POST /api/lora/clear. */
export function loraManagementRoutes() {
  return new Elysia({ name: "lora-management", },)
    // GET /api/lora/list
    .get("/api/lora/list", (ctx,) => {
      const { userId, } = extractAuth(ctx,);
      if (!userId) {
        return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED", }, 401,);
      }

      const params = ctx.query;
      const cached = getCachedLoras();
      const models: import("../types").LoRAModel[] = [];

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
    },);
}
