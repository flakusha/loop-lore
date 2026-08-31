// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { can, } from "../../users/permissions";
import { safeFetch, } from "../../utils";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function sdStatusRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-sd-status", },)
      // ── SD.CPP status ──────────────────────────────────────
      .get(`${prefix}/admin/sd-status`, async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const config = opts.config;
        const sdPort: number = (config as any).generation?.autoStart?.sdCpp?.port ?? 9010;
        let status: "running" | "stopped" | "unknown";
        let latencyMs: number | null = null;

        const start = Date.now();
        const result = await safeFetch<string>(`http://127.0.0.1:${String(sdPort,)}/`, {
          timeout: 5_000,
          parseJson: false,
        },);
        if (result.ok || result.status !== undefined) {
          latencyMs = Date.now() - start;
        }
        status = result.ok ? "running" : "stopped";

        return jsonResponse({
          status,
          port: sdPort,
          latencyMs,
        },);
      }, {
        response: {
          200: t.Object({ status: t.String(), port: t.Number(), latencyMs: t.Optional(t.Number(),), },),
          403: ErrorResponse,
        },
      },)
  );
}
