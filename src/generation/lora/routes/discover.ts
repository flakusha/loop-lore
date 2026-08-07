import { Elysia, t, } from "elysia";
import type { Config, } from "../../../config/schema";
import { extractAuth, jsonResponse, } from "../../../routes/http-utils";
import { ErrorResponse, SuccessResponse, } from "../../../validation/schemas";
import { discoverAllLoras, discoverLoras, } from "../discovery";
import { resolveBackendUrls, } from "./urls";

// ── Validation Schema ───────────────────────────────────

const DiscoverBody = t.Object({
  backend: t.Optional(t.UnionEnum(["comfyui", "sd-server",],),),
  baseUrl: t.Optional(t.String(),),
  forceRefresh: t.Optional(t.Boolean(),),
},);

/** POST /api/lora/discover — Trigger LoRA discovery for a backend. */
export function discoverRoutes(config: Config,) {
  return new Elysia({ name: "lora-discover", },)
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

      const allModels: import("../types").LoRAModel[] = [];
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
    },);
}
