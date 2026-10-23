// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin runtime-seed route — re-run the boot seeders without restarting.
 *
 * Boot (`src/server/start.ts`) calls `seedConfiguredUsers` +
 * `seedConfiguredContent` (both in `src/seeding/`) once at startup; a config change after boot
 * otherwise needs a restart to take effect. This endpoint re-runs both
 * seeders on demand. Both are idempotent (stable ids, skip-existing), so a
 * repeat call is a no-op — the response counts prove it.
 * @param opts
 * @param prefix
 */
import { Elysia, t, } from "elysia";
import { applyEnvironmentOverrides, seedConfiguredContent, } from "../../seeding/content";
import { seedConfiguredUsers, } from "../../seeding/users";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, withPermissionAuth, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

export function seedRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const { database, config, } = opts;
  return new Elysia({ name: "admin-seed", },).post(
    `${prefix}/admin/seed`,
    async (ctx: any,) =>
      withPermissionAuth(ctx, "admin.system", async () => {
        const effective = applyEnvironmentOverrides(config.seeding,);
        const users = await seedConfiguredUsers(database, { ...config, seeding: effective, },);
        const content = await seedConfiguredContent(database, effective, config.auth.required,);
        return jsonResponse({ content, users, },);
      },),
    {
      response: {
        200: t.Object({ content: t.Number(), users: t.Number(), },),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
  );
}
