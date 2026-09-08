// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { getScheduler, } from "../../cron/registry";
import { can, } from "../../users/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * @param _opts
 * @param prefix
 */
export function cronRoutes(_opts: AdminRouteOpts, prefix = "/api",) {
  const requireAdmin = (ctx: any,) => {
    if (!can(ctx.userRole, "admin.system",)) {
      return jsonError({
        message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
        status: HttpStatus.Forbidden,
        code: ErrorCode.Forbidden,
      },);
    }
    const scheduler = getScheduler();
    if (!scheduler) {
      return jsonError({
        message: "Scheduler not running",
        status: HttpStatus.ServiceUnavailable,
        code: ErrorCode.ServiceUnavailable,
      },);
    }
    return scheduler;
  };

  return (
    new Elysia({ name: "admin-cron", },)
      // ── Job status list ────────────────────────────────
      .get(`${prefix}/admin/cron/jobs`, async (ctx: any,) => {
        const scheduler = requireAdmin(ctx,);
        if (scheduler instanceof Response) { return scheduler; }
        return jsonResponse(scheduler.getStatus(),);
      }, {
        response: {
          200: t.Any(),
          403: ErrorResponse,
          503: ErrorResponse,
        },
      },)
      // ── Manual job trigger ─────────────────────────────
      .post(`${prefix}/admin/cron/jobs/:name/run`, async (ctx: any,) => {
        const scheduler = requireAdmin(ctx,);
        if (scheduler instanceof Response) { return scheduler; }
        const name = String(ctx.params?.name ?? "",);
        try {
          const result = await scheduler.runOnce(name,);
          return jsonResponse({ name, result: result ?? null, },);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error,);
          const notFound = message.startsWith("Unknown cron job",);
          return jsonError({
            message,
            status: notFound ? HttpStatus.NotFound : HttpStatus.InternalServerError,
            code: notFound ? ErrorCode.NotFound : ErrorCode.ServerError,
          },);
        }
      }, {
        response: {
          200: t.Any(),
          400: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          500: ErrorResponse,
          503: ErrorResponse,
        },
      },)
  );
}
