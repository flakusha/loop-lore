// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin config routes (FEAT-051).
 *
 * Admin-only read/write of a plugin's stored config in
 * `plugin_state.config_json`. The loader merges the stored object over the
 * manifest defaults at load time and enforces `configSchema.required`.
 *
 *   GET /api/plugins/:name/config — read the stored config
 *   PUT /api/plugins/:name/config — validate + persist the config
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { mergePluginConfig, } from "../../plugins/config-merge";
import { readStoredPluginConfig, writeStoredPluginConfig, } from "../../plugins/config-store";
import { registry, } from "../../plugins/registry";
import type { LoadedPlugin, } from "../../plugins/types";
import { can, } from "../../users/permissions";
import { forbidden, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, } from "../http-utils";

/**
 * Resolve the admin gate and the target plugin for a config request.
 * @param ctx - Elysia context (`userRole` + `params.name`).
 * @returns The loaded plugin, or the error Response to short-circuit with.
 */
function resolvePlugin(ctx: any,): { plugin: LoadedPlugin } | { error: Response } {
  if (!can(ctx.userRole, "admin.system",)) {
    return { error: forbidden("Admin access required",), };
  }

  const plugin = registry.getPlugin(ctx.params.name as string,);
  if (!plugin) {
    return { error: jsonError({ message: "Plugin not found", status: HttpStatus.NotFound, },), };
  }

  return { plugin, };
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 * @returns An Elysia plugin exposing the plugin config read/write routes.
 */
export function pluginConfigRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "plugin-config", },)
    .get(
      `${prefix}/plugins/:name/config`,
      async (ctx: any,) => {
        const resolved = resolvePlugin(ctx,);
        if ("error" in resolved) { return resolved.error; }
        const config = await readStoredPluginConfig(database, resolved.plugin.manifest.name,);
        return jsonResponse({ config, },);
      },
      {
        response: {
          200: SuccessResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get plugin config",
          description: "Read a plugin's stored config overrides. Admin only.",
          tags: ["Plugins",],
        },
      },
    )
    .put(
      `${prefix}/plugins/:name/config`,
      async (ctx: any,) => {
        const resolved = resolvePlugin(ctx,);
        if ("error" in resolved) { return resolved.error; }
        const { plugin } = resolved;
        const name = plugin.manifest.name;
        // `origin` is passed so a row this write has to create lands with the
        // loader's origin default instead of silently disabling a core plugin.
        const origin = plugin.origin;
        const body = ctx.body;

        if (body === null || typeof body !== "object" || Array.isArray(body,)) {
          return jsonError({ message: "Plugin config must be a JSON object", status: HttpStatus.BadRequest, },);
        }

        const stored = body as Record<string, unknown>;

        try {
          // Enforce configSchema.required against defaults + stored before saving.
          mergePluginConfig(plugin.manifest.config ?? {}, stored, plugin.manifest.configSchema,);
        } catch (error) {
          return jsonError({ message: (error as Error).message, status: HttpStatus.BadRequest, },);
        }

        try {
          await writeStoredPluginConfig(database, name, stored, origin,);
        } catch (error) {
          getLogger().error({
            message: "Failed to persist plugin config",
            plugin: name,
            error: String(error,),
          },);

          return jsonError({ message: "Failed to persist plugin config", status: HttpStatus.InternalServerError, },);
        }

        getLogger().child({ module: "plugins", },).info("Plugin config updated", { plugin: name, },);
        return jsonResponse({ config: stored, },);
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
          summary: "Set plugin config",
          description: "Validate and persist a plugin's config overrides. Admin only.",
          tags: ["Plugins",],
        },
      },
    );
}
