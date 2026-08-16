// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { isAdminRole, } from "../../middleware/admin-gate";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

export function sdStatusRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-sd-status", },)
      // ── SD.CPP status ──────────────────────────────────────
      .get(`${prefix}/admin/sd-status`, async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
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

        try {
          const start = Date.now();
          const res = await fetch(`http://127.0.0.1:${String(sdPort,)}/`, {
            signal: AbortSignal.timeout(5000,),
          },);
          latencyMs = Date.now() - start;
          status = res.ok ? "running" : "stopped";
        } catch {
          status = "stopped";
        }

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
