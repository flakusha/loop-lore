// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { getHealthCache, getProviderHealth, providerToSummary, scanAllProviders, } from "../../admin/provider-health";
import { listProviders, } from "../../generation/providers/registry";
import { can, } from "../../users/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";

export function providersRoutes(opts: { database?: unknown } = {}, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-providers", },)
      // ── Public providers list (no auth) ───────────────────
      .get(`${prefix}/providers`, () => {
        const health = getHealthCache();
        const providers = Array.from(listProviders(), (p,) => {
          const status = health.find((h,) => h.name === p.name);
          return {
            name: p.name,
            label: p.capabilities.label,
            status: status?.status ?? "unknown",
          };
        },);

        return jsonResponse({ providers, },);
      }, {
        response: {
          200: t.Object({ providers: t.Array(t.Any(),), },),
        },
        detail: {
          summary: "List active providers",
          description: "Returns available providers for settings dropdown. No authentication required.",
          tags: ["Providers",],
        },
      },)
      // ── Provider management ────────────────────────────────
      .get(`${prefix}/admin/providers`, (ctx: any,) => {
        const { userRole, } = ctx;
        if (!can(userRole, "admin.system",)) {
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
      .get(`${prefix}/admin/providers/:name/models`, (ctx: any,) => {
        const { params, userRole, } = ctx;
        if (!can(userRole, "admin.system",)) {
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
      .post(`${prefix}/admin/providers/rescan`, async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const results = await scanAllProviders(opts.database,);
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
