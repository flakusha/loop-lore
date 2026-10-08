// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin Management Routes
 *
 * Admin-only endpoints for plugin enable/disable at runtime:
 *   GET  /api/plugins              — list all plugins with status
 *   GET  /api/plugins/ui-components — list plugin UI components (mount points)
 *   POST /api/plugins/:name/enable  — enable a plugin
 *   POST /api/plugins/:name/disable — disable a plugin
 *
 * Per-plugin config read/write lives in `./config` (FEAT-051).
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { initializePlugin, } from "../../plugins/loader";
import { getComponentsForMountPoint, } from "../../plugins/mount-points";
import { registry, } from "../../plugins/registry";
import { can, } from "../../users/permissions";
import { forbidden, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import { pluginConfigRoutes, } from "./config";

/** */
function log() {
  return getLogger().child({ module: "plugins", },);
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { plugins: { get: { ...; }; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
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
    .get(
      `${prefix}/plugins/ui-components`,
      (ctx: any,) => {
        if (!can(ctx.userRole, "admin.system",)) {
          return forbidden("Admin access required",);
        }

        const all = registry.getAllUIComponents();
        const rawLocation: unknown = ctx.query?.location;
        const location = typeof rawLocation === "string" && rawLocation.length > 0 ? rawLocation : undefined;
        const components = location ? getComponentsForMountPoint(all, location,) : all;

        return jsonResponse(
          components.map((c,) => ({
            name: c.name,
            location: c.location,
            type: c.type,
            props: c.props ?? {},
          })),
        );
      },
      {
        response: {
          200: t.Array(t.Any(),),
          403: ErrorResponse,
        },
        detail: {
          summary: "List UI components",
          description: "List plugin-declared UI components, optionally filtered by mount-point location. Admin only.",
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

        // A plugin loaded while unapproved never ran `onLoad`, so enabling has
        // to perform the initialization the loader deferred. A hook that
        // throws leaves the plugin disabled again — the same rollback the
        // loader does on a failed load.
        try {
          await initializePlugin({ db: database, manifest: plugin.manifest, },);
        } catch (error) {
          registry.setEnabled(name, false,);
          log().error({ message: `Plugin failed to initialize`, plugin: name, error: String(error,), },);
          return jsonError({ message: "Plugin failed to initialize", status: HttpStatus.InternalServerError, },);
        }

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
          500: ErrorResponse,
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
    )
    .use(pluginConfigRoutes({ database, }, prefix,),);
}
