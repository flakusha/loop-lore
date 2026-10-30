// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { getHealthCache, getProviderHealth, providerToSummary, scanAllProviders, } from "../../admin/provider-health";
import type { DB, } from "../../db/schema";
import { listProviders, } from "../../generation/providers/registry";
import type { ModelFit, } from "../../models/fit-lookup";
import type { GlobalScore, } from "../../models/global-score";
import { ErrorResponse, } from "../../validation/schemas";
import {
  ErrorCode,
  HttpStatus,
  jsonError,
  jsonResponse,
  requirePermissionUserId,
} from "../http-utils";

/**
 * @param opts
 * @param opts.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { providers: { get: { ...; }; }; }; } & { ...; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function providersRoutes(opts: { database?: Kysely<DB> } = {}, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-providers", },)
      // ── Public providers list (no auth) ───────────────────
      .get(`${prefix}/providers`, (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
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
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

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
      .get(`${prefix}/admin/providers/:name/models`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const providerName = ctx.params.name as string;

        const health = getProviderHealth(providerName,);
        if (!health) {
          return jsonError({
            message: ctx.t?.("admin.providerNotFound",) ?? "Provider not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }

        // Cached llmfit verdicts per model id; nulls when the DB is
        // unavailable or no verdict matches — never a guess. Same for
        // the global board score: a separate badge, never merged into fit.
        let fit = new Map<string, ModelFit | null>();
        let globalScore = new Map<string, GlobalScore | null>();
        if (opts.database) {
          try {
            const { fitForModels, } = await import("../../models/fit-lookup");
            const { globalScoresForModels, } = await import("../../models/global-score");
            const ids = health.models.map((m,) => m.id);
            fit = await fitForModels(opts.database, ids,);
            globalScore = await globalScoresForModels(opts.database, ids,);
          } catch {
            fit = new Map<string, ModelFit | null>();
            globalScore = new Map<string, GlobalScore | null>();
          }
        }

        return jsonResponse({
          name: health.name,
          label: health.label,
          models: health.models.map((m,) => ({
            ...m,
            fit: fit.get(m.id,) ?? null,
            globalScore: globalScore.get(m.id,) ?? null,
          })),
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
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

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
