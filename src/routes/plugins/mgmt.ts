// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin Lifecycle Routes (TASK-plugin-management-api).
 *
 * Admin-only install / discover / uninstall over the on-disk plugin
 * directories (`plugins/core`, `plugins/community`, `plugins/local`):
 *   GET    /api/plugins/discover — on-disk manifests not yet registered
 *   POST   /api/plugins/install  — register an on-disk plugin + persist state
 *   DELETE /api/plugins/:name     — drop registration + plugin_state row
 *
 * There is no package/download machinery in this codebase (plugin security
 * sandboxing is unbuilt), so install/uninstall are registry and state
 * operations over directories an operator dropped in place — the same scan
 * the loader runs at boot. Nothing on disk is created or deleted, and an
 * uninstalled plugin reappears in `discover` until its directory is removed.
 *
 * Usage tracking: no chat/request-level plugin usage is persisted anywhere,
 * so there is no "plugin in use" guard beyond requiring a disabled plugin
 * before uninstall.
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  forgetLoadedPlugin,
  isPluginInitialized,
  loadSinglePlugin,
  scanAvailablePlugins,
  type ScanAvailablePluginsOpts,
} from "../../plugins/loader";
import { registry, } from "../../plugins/registry";
import { can, } from "../../users/permissions";
import { forbidden, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import { getLogger, } from "../../logger";

/**
 * Read the app-level auth derive's role.
 *
 * The auth derive runs on the outer app after this standalone plugin
 * instance's context types were fixed, so `userRole` exists only at
 * runtime — one narrow escape here instead of `any`-typed handlers.
 * @param ctx - The Elysia request context
 * @returns The resolved role, or null when absent/not a string.
 */
function roleOf(ctx: unknown,): string | null {
  const role = (ctx as { userRole?: unknown }).userRole;
  return typeof role === "string" ? role : null;
}

/** */
function log() {
  return getLogger().child({ module: "plugins", },);
}

/**
 * Plugin install / discover / uninstall routes.
 * @param root0
 * @param root0.database
 * @param prefix
 * @param scanOpts - Scan-root override, forwarded to the loader's discovery.
 * @returns An Elysia plugin exposing the plugin lifecycle routes.
 */
export function pluginMgmtRoutes(
  { database, }: { database: Kysely<DB> },
  prefix = "/api",
  scanOpts: ScanAvailablePluginsOpts = {},
) {
  return new Elysia({ name: "plugin-mgmt", },)
    .get(
      `${prefix}/plugins/discover`,
      async (ctx,) => {
        if (!can(roleOf(ctx,), "admin.system",)) {
          return forbidden("Admin access required",);
        }

        const available = await scanAvailablePlugins(scanOpts,);
        const undiscovered = available.filter((p) => !registry.getPlugin(p.manifest.name,),);
        return jsonResponse(undiscovered.map((p,) => ({
          name: p.manifest.name,
          version: p.manifest.version,
          description: p.manifest.description,
          author: p.manifest.author,
          origin: p.origin,
        })),);
      },
      {
        response: {
          200: t.Array(t.Any(),),
          403: ErrorResponse,
        },
        detail: {
          summary: "Discover plugins",
          description:
            "List plugin manifests present on disk that are not loaded. Admin only.",
          tags: ["Plugins",],
        },
      },
    )
    .post(
      `${prefix}/plugins/install`,
      async (ctx,) => {
        if (!can(roleOf(ctx,), "admin.system",)) {
          return forbidden("Admin access required",);
        }

        // The route's `body` schema guarantees `{ name: string }` (Elysia
        // rejects anything else with 422 before the handler runs).
        const name = ctx.body.name;
        if (registry.getPlugin(name,)) {
          return jsonError({ message: "Plugin already installed", status: HttpStatus.Conflict, },);
        }

        const available = await scanAvailablePlugins(scanOpts,);
        const found = available.find((p,) => p.manifest.name === name,);
        if (!found) {
          return jsonError({ message: "Plugin not found", status: HttpStatus.NotFound, },);
        }

        // The loader owns the load: register, origin-scoped approval
        // (core self-approves, community/local land disabled), deferred
        // `onLoad`, and the plugin_state row. A failed load rolls its
        // registration back and logs, so a still-absent registry entry
        // below means the plugin never came up.
        await loadSinglePlugin(database, found.manifest.name, found.directory, found.origin,);
        if (!registry.getPlugin(name,)) {
          return jsonError({
            message: "Plugin failed to install",
            status: HttpStatus.InternalServerError,
          },);
        }

        log().info("Plugin installed", { plugin: name, origin: found.origin, },);
        return jsonResponse({ ok: true, name, origin: found.origin, enabled: registry.isEnabled(name,), },);
      },
      {
        body: t.Object({ name: t.String({ minLength: 1, },), },),
        response: {
          200: SuccessResponse,
          400: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
          500: ErrorResponse,
        },
        detail: {
          summary: "Install plugin",
          description:
            "Register an on-disk plugin and persist its approval state. Admin only.",
          tags: ["Plugins",],
        },
      },
    )
    .delete(
      `${prefix}/plugins/:name`,
      async (ctx,) => {
        if (!can(roleOf(ctx,), "admin.system",)) {
          return forbidden("Admin access required",);
        }

        const name = ctx.params.name;
        const plugin = registry.getPlugin(name,);
        if (!plugin) {
          return jsonError({ message: "Plugin not found", status: HttpStatus.NotFound, },);
        }

        // The uninstall precondition mirrors the enable/disable state
        // conflicts (400): teardown of a live plugin is never implicit.
        if (registry.isEnabled(name,)) {
          return jsonError({
            message: "Plugin must be disabled before uninstalling",
            status: HttpStatus.BadRequest,
          },);
        }

        // `onUnload` only for a plugin that ever ran `onLoad` — the same
        // teardown-without-setup the loader's failed-load rollback avoids.
        // A failing hook is logged and the uninstall proceeds; shutdown
        // treats teardown failures as best-effort the same way.
        if (isPluginInitialized(name,) && plugin.manifest.onUnload) {
          try {
            await plugin.manifest.onUnload();
          } catch (error) {
            log().error({
              message: "Plugin onUnload failed — continuing uninstall",
              plugin: name,
              error: String(error,),
            },);
          }
        }

        forgetLoadedPlugin(name,);
        registry.unregister(name,);

        // Drop the approval row so a reinstall starts from the origin
        // default. This also drops stored config overrides — cleanup, not
        // preservation.
        try {
          await database.deleteFrom("plugin_state",).where("name", "=", name,).execute();
        } catch (error) {
          log().error({
            message: "Failed to delete plugin state row",
            plugin: name,
            error: String(error,),
          },);
        }

        log().info("Plugin uninstalled", { plugin: name, },);
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
          summary: "Uninstall plugin",
          description:
            "Remove a disabled plugin: run onUnload, drop the registration and its plugin_state row. Admin only.",
          tags: ["Plugins",],
        },
      },
    );
}
