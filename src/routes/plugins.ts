// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin Management Routes
 *
 * Admin-only endpoints for plugin enable/disable at runtime:
 *   GET  /api/plugins              — list all plugins with status
 *   POST /api/plugins/:name/enable  — enable a plugin
 *   POST /api/plugins/:name/disable — disable a plugin
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { registry, } from "../plugins/registry";
import { can, } from "../users/permissions";
import { forbidden, } from "../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, } from "./http-utils";

function log() {
  return getLogger().child({ module: "plugins", },);
}

export function pluginRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "plugins", },)
    .get(
      `${prefix}/plugins`,
      (ctx: any,) => {
        if (!can(ctx.userRole, "admin.system",)) {
          return forbidden("Admin access required",);
        }

        const plugins = Array.from(registry.listPlugins(), (p,) => ({
          name: p.manifest.name,
          version: p.manifest.version,
          description: p.manifest.description,
          author: p.manifest.author,
          origin: p.origin,
          enabled: registry.isEnabled(p.manifest.name,),
          routeCount: registry.getPluginRoutes(p.manifest.name,).length,
        }),);

        return jsonResponse(plugins,);
      },
      {
        response: {
          200: t.Array(t.Any(),),
          403: ErrorResponse,
        },
        detail: {
          summary: "List plugins",
          description: "List all loaded plugins with their status. Admin only.",
          tags: ["Plugins",],
        },
      },
    )
    .post(
      `${prefix}/plugins/:name/enable`,
      async ({ params, userRole, }: any,) => {
        if (!can(userRole, "admin.system",)) {
          return forbidden("Admin access required",);
        }

        const name = params.name as string;
        const plugin = registry.getPlugin(name,);
        if (!plugin) {
          return jsonError({ message: "Plugin not found", status: HttpStatus.NotFound, },);
        }

        if (registry.isEnabled(name,)) {
          return jsonError({ message: "Plugin already enabled", status: HttpStatus.BadRequest, },);
        }

        registry.setEnabled(name, true,);

        try {
          await database
            .insertInto("plugin_state",)
            .values({ name, status: "active", enabled_at: new Date().toISOString(), disabled_at: null, },)
            .onConflict((oc,) =>
              oc
                .column("name",)
                .doUpdateSet({ status: "active", enabled_at: new Date().toISOString(), disabled_at: null, },)
            )
            .execute();
        } catch {
          // Persisting plugin state is best-effort
        }

        log().info("Plugin enabled", { plugin: name, },);
        return jsonResponse({ ok: true, },);
      },
      {
        response: {
          200: SuccessResponse,
          400: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Enable plugin",
          description: "Enable a loaded plugin. Admin only.",
          tags: ["Plugins",],
        },
      },
    )
    .post(
      `${prefix}/plugins/:name/disable`,
      async ({ params, userRole, }: any,) => {
        if (!can(userRole, "admin.system",)) {
          return forbidden("Admin access required",);
        }

        const name = params.name as string;
        const plugin = registry.getPlugin(name,);
        if (!plugin) {
          return jsonError({ message: "Plugin not found", status: HttpStatus.NotFound, },);
        }

        if (!registry.isEnabled(name,)) {
          return jsonError({ message: "Plugin already disabled", status: HttpStatus.BadRequest, },);
        }

        registry.setEnabled(name, false,);

        try {
          await database
            .insertInto("plugin_state",)
            .values({ name, status: "disabled", disabled_at: new Date().toISOString(), },)
            .onConflict((oc,) =>
              oc.column("name",).doUpdateSet({ status: "disabled", disabled_at: new Date().toISOString(), },)
            )
            .execute();
        } catch {
          // Persisting plugin state is best-effort
        }

        log().info("Plugin disabled", { plugin: name, },);
        return jsonResponse({ ok: true, },);
      },
      {
        response: {
          200: SuccessResponse,
          400: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Disable plugin",
          description: "Disable a loaded plugin. Admin only.",
          tags: ["Plugins",],
        },
      },
    );
}
