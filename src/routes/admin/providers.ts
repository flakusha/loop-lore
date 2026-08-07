import { Elysia, t, } from "elysia";
import { getHealthCache, getProviderHealth, providerToSummary, scanAllProviders, } from "../../admin/provider-health";
import { listProviders, } from "../../generation/providers/registry";
import { isAdminRole, } from "../../middleware/admin-gate";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";

export function providersRoutes() {
  return (
    new Elysia({ name: "admin-providers", },)
      // ── Provider management ────────────────────────────────
      .get("/api/admin/providers", (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const health = getHealthCache();
        const providers = Array.from(listProviders(), (p,) => {
          const status = health.find((h,) => h.name === p.name);
          return {
            name: p.name,
            label: p.capabilities.label,
            capabilities: p.capabilities,
            status: status?.status ?? "unknown",
            modelCount: status?.models.length ?? 0,
            latencyMs: status?.latencyMs,
            lastChecked: status?.lastChecked,
            error: status?.error,
          };
        },);

        return jsonResponse({ providers, },);
      }, {
        response: {
          200: t.Object({ providers: t.Array(t.Any(),), },),
          403: ErrorResponse,
        },
      },)
      .get("/api/admin/providers/:name/models", (ctx: any,) => {
        const { params, userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const providerName = params.name as string;

        const health = getProviderHealth(providerName,);
        if (!health) {
          return jsonError({
            message: ctx.t?.("admin.providerNotFound",) ?? "Provider not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }
        return jsonResponse({
          name: health.name,
          label: health.label,
          models: health.models,
          status: health.status,
        },);
      }, {
        response: {
          200: t.Object({ name: t.String(), label: t.String(), models: t.Array(t.Any(),), status: t.String(), },),
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },)
      .post("/api/admin/providers/rescan", async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const results = await scanAllProviders();
        return jsonResponse({
          providers: Array.from(results, (p,) => providerToSummary(p,),),
        },);
      }, {
        response: {
          200: t.Object({ providers: t.Array(t.Any(),), },),
          403: ErrorResponse,
        },
      },)
  );
}
