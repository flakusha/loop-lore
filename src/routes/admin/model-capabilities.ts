// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import {
  clearModelOverride,
  listModelCapabilities,
  resolveModelCapabilities,
  setModelOverride,
} from "../../admin/model-capabilities";
import { can, } from "../../users/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, extractAuth, HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * Admin routes for model capability registry.
 *
 * GET  /admin/model-capabilities       — list all registered models
 * GET  /admin/model-capabilities/:provider/:model — resolve one model
 * PATCH /admin/model-capabilities/:provider/:model — set user override
 * DELETE /admin/model-capabilities/:provider/:model — clear user override
 * @param opts
 * @param prefix
 */
export function modelCapabilitiesRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-model-capabilities", },)
      // ── List all ───────────────────────────────────────────
      .get(`${prefix}/admin/model-capabilities`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const provider = ctx.query?.provider as string | undefined;
        const capabilities = await listModelCapabilities(opts.database, provider,);

        return jsonResponse({ capabilities, },);
      }, {
        response: {
          200: t.Object({ capabilities: t.Array(t.Any(),), },),
          403: ErrorResponse,
        },
      },)
      // ── Resolve one model ──────────────────────────────────
      .get(`${prefix}/admin/model-capabilities/:provider/:model`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const caps = await resolveModelCapabilities(
          opts.database,
          ctx.params.provider,
          ctx.params.model,
        );

        if (!caps) {
          return jsonError({
            message: "Model not found in registry",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }

        return jsonResponse({ capabilities: caps, },);
      }, {
        response: {
          200: t.Object({ capabilities: t.Any(), },),
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },)
      // ── Set user override ──────────────────────────────────
      .patch(`${prefix}/admin/model-capabilities/:provider/:model`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const ok = await setModelOverride(
          opts.database,
          ctx.params.provider,
          ctx.params.model,
          {
            contextWindow: ctx.body.contextWindow ?? undefined,
            maxOutput: ctx.body.maxOutput ?? undefined,
            supportsTools: ctx.body.supportsTools ?? undefined,
            supportsVision: ctx.body.supportsVision ?? undefined,
            supportsThinking: ctx.body.supportsThinking ?? undefined,
            notes: ctx.body.notes ?? undefined,
          },
        );

        if (!ok) {
          return jsonError({
            message: "Model not found in registry",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }

        const caps = await resolveModelCapabilities(
          opts.database,
          ctx.params.provider,
          ctx.params.model,
        );

        return jsonResponse({ capabilities: caps, },);
      }, {
        body: t.Object({
          contextWindow: t.Optional(t.Union([t.Number(), t.Null(),],),),
          maxOutput: t.Optional(t.Union([t.Number(), t.Null(),],),),
          supportsTools: t.Optional(t.Union([t.Boolean(), t.Null(),],),),
          supportsVision: t.Optional(t.Union([t.Boolean(), t.Null(),],),),
          supportsThinking: t.Optional(t.Union([t.Boolean(), t.Null(),],),),
          notes: t.Optional(t.Union([t.String(), t.Null(),],),),
        },),
        response: {
          200: t.Object({ capabilities: t.Any(), },),
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },)
      // ── Clear user override ────────────────────────────────
      .delete(`${prefix}/admin/model-capabilities/:provider/:model`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const ok = await clearModelOverride(
          opts.database,
          ctx.params.provider,
          ctx.params.model,
        );

        if (!ok) {
          return jsonError({
            message: "Model not found in registry",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }

        return jsonResponse({ success: true, },);
      }, {
        response: {
          200: t.Object({ success: t.Boolean(), },),
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },)
  );
}
