// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GET /api/admin/blender-status — cached local Blender capability verdict.
 *
 * The route never takes a binary path or flags from HTTP input; discovery
 * resolves `blender` from PATH inside the bridge boundary.
 */

import { Elysia, t, } from "elysia";
import { type BlenderDiscoverySnapshot, discoverBlender, } from "../../blender/discovery";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requirePermissionUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

export interface BlenderStatusRouteOpts extends AdminRouteOpts {
  /** Test seam; production uses the cached module-level discovery. */
  discover?: () => Promise<BlenderDiscoverySnapshot>;
}

const BlenderStatusResponse = t.Object({
  probedAt: t.String(),
  binary: t.Union([t.String(), t.Null(),],),
  ok: t.Boolean(),
  status: t.Union([
    t.Literal("unavailable",),
    t.Literal("timeout",),
    t.Literal("unsupported",),
    t.Literal("malformed",),
    t.Null(),
  ],),
  message: t.String(),
  version: t.Union([t.String(), t.Null(),],),
  stages: t.Array(t.String(),),
  supported: t.Boolean(),
  provenance: t.Union([
    t.Object({
      binary: t.String(),
      version: t.String(),
      scriptDigest: t.String(),
      startedAt: t.String(),
      durationMs: t.Number(),
      exitCode: t.Union([t.Integer(), t.Null(),],),
      timedOut: t.Boolean(),
    },),
    t.Null(),
  ],),
},);

/**
 * @param opts - admin route options with optional discovery seam
 * @param prefix - route prefix
 * @returns Elysia plugin exposing the Blender capability verdict
 */
export function blenderStatusRoutes(opts: BlenderStatusRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-blender-status", },)
      .get(`${prefix}/admin/blender-status`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const snapshot = await (opts.discover ?? discoverBlender)();
        return jsonResponse({ ...snapshot, stages: [...snapshot.stages,], },);
      }, {
        detail: {
          summary: "Probe the local Blender binary",
          description: "Reports the pinned-version capability verdict for the Blender binary found on PATH, " +
            "including structured failure reasons. The result is cached until an explicit refresh; " +
            "no flags or binary paths are accepted from HTTP input.",
          tags: ["Admin", "Creative tools",],
        },
        response: {
          200: BlenderStatusResponse,
          403: ErrorResponse,
        },
      },)
  );
}
