// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { safeFetch, } from "../../utils";
import { ErrorResponse, } from "../../validation/schemas";
import {
  jsonResponse,
  requirePermissionUserId,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { "sd-status": { ...; }; }; }; }, { ...; }, { ...; }>}
 */
export function sdStatusRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-sd-status", },)
      // ── SD.CPP status ──────────────────────────────────────
      .get(`${prefix}/admin/sd-status`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

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
