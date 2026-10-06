// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { ErrorResponse, } from "../../validation/schemas";
import {
  HttpStatus,
  jsonError,
  jsonResponse,
  requirePermissionUserId,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { "rotate-expired-keys": { ...; }; }; }; }, { ...; }, { ...; }>}
 */
export function keyRotationRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-key-rotation", },)
      // ── Manual key rotation trigger ─────────────────────────
      .post(`${prefix}/admin/rotate-expired-keys`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const { runAutoRotation, } = await import("../../crypto/key-rotation");
        const rotationDays = opts.config.encryption.keyRotationDays ?? 0;

        if (rotationDays <= 0) {
          return jsonError({
            message: ctx.t?.("admin.autoRotationDisabled",) ??
              "Auto-rotation is disabled (keyRotationDays = 0)",
            status: HttpStatus.BadRequest,
          },);
        }

        const result = await runAutoRotation(opts.database, rotationDays,);
        return jsonResponse(result,);
      }, {
        response: {
          200: t.Any(),
          400: ErrorResponse,
          403: ErrorResponse,
        },
      },)
  );
}
