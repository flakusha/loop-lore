// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { isAdminRole, } from "../../middleware/admin-gate";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

export function keyRotationRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-key-rotation", },)
      // ── Manual key rotation trigger ─────────────────────────
      .post(`${prefix}/admin/rotate-expired-keys`, async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

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
