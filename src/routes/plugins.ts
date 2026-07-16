/**
 * Plugin Management Routes
 *
 * Admin-only endpoints for plugin enable/disable at runtime:
 *   GET  /api/plugins              — list all plugins with status
 *   POST /api/plugins/:name/enable  — enable a plugin
 *   POST /api/plugins/:name/disable — disable a plugin
 */

import { Elysia } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { jsonResponse, jsonError, HttpStatus } from "./http-utils";
import { registry } from "../plugins/registry";
import { getLogger } from "../logger";
import { forbidden } from "../validation/middleware";

function log() {
  return getLogger().child({ module: "plugins" });
}

export function pluginRoutes({ database }: { database: Kysely<DB> }) {
  return new Elysia({ name: "plugins" })
    .get("/api/plugins", async (ctx: any) => {
      if (ctx.userRole !== "admin") {
        return forbidden("Admin access required");
      }

      const plugins = registry.listPlugins().map((p) => ({
        name: p.manifest.name,
        version: p.manifest.version,
        description: p.manifest.description,
        author: p.manifest.author,
        origin: p.origin,
        enabled: registry.isEnabled(p.manifest.name),
        routeCount: registry.getPluginRoutes(p.manifest.name).length,
      }));

      return jsonResponse(plugins);
    })
    .post("/api/plugins/:name/enable", async ({ params, userRole }: any) => {
      if (userRole !== "admin") {
        return forbidden("Admin access required");
      }

      const name = params.name as string;
      const plugin = registry.getPlugin(name);
      if (!plugin) {
        return jsonError({ message: "Plugin not found", status: HttpStatus.NotFound });
      }

      if (registry.isEnabled(name)) {
        return jsonError({ message: "Plugin already enabled", status: HttpStatus.BadRequest });
      }

      registry.setEnabled(name, true);

      await database
        .insertInto("plugin_state")
        .values({ name, enabled: 1, enabled_at: new Date().toISOString(), disabled_at: null })
        .onConflict((oc) =>
          oc
            .column("name")
            .doUpdateSet({ enabled: 1, enabled_at: new Date().toISOString(), disabled_at: null }),
        )
        .execute()
        .catch(() => {});

      log().info("Plugin enabled", { plugin: name });
      return jsonResponse({ ok: true });
    })
    .post("/api/plugins/:name/disable", async ({ params, userRole }: any) => {
      if (userRole !== "admin") {
        return forbidden("Admin access required");
      }

      const name = params.name as string;
      const plugin = registry.getPlugin(name);
      if (!plugin) {
        return jsonError({ message: "Plugin not found", status: HttpStatus.NotFound });
      }

      if (!registry.isEnabled(name)) {
        return jsonError({ message: "Plugin already disabled", status: HttpStatus.BadRequest });
      }

      registry.setEnabled(name, false);

      await database
        .insertInto("plugin_state")
        .values({ name, enabled: 0, disabled_at: new Date().toISOString() })
        .onConflict((oc) =>
          oc.column("name").doUpdateSet({ enabled: 0, disabled_at: new Date().toISOString() }),
        )
        .execute()
        .catch(() => {});

      log().info("Plugin disabled", { plugin: name });
      return jsonResponse({ ok: true });
    });
}
