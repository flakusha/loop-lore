// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin NSFW Configuration Routes
 *
 * Admin-level NSFW policy management:
 *   GET  /api/admin/nsfw        — get current NSFW config
 *   PUT  /api/admin/nsfw        — update NSFW config
 *   GET  /api/admin/nsfw/policy — list character NSFW policies
 *
 * Requires admin role.
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { setConfig, } from "../admin/config";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { getRuntimeNsfwConfig, type NsfwRuntimeConfig, updateRuntimeNsfwConfig, } from "../nsfw/runtime-config";
import { can, } from "../users/permissions";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "./http-utils";

/** */
function log(): Logger {
  return getLogger().child({ module: "admin-nsfw", },);
}

/** Config keys (dotted paths matching HOT_APPLY_PATHS) */
const NSFW_ALLOW_KEY = "nsfw.allowNsfw";
const NSFW_MIN_AGE_KEY = "nsfw.nsfwMinAge";

interface NsfwAdminConfig {
  allowNsfw: boolean;
  nsfwMinAge: number;
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { nsfw: { get: { ...; }; }; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function adminNsfwRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "admin-nsfw", },)
    // ── Get NSFW config ───────────────────────────────────
    .get(`${prefix}/admin/nsfw`, (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const userRole = ctx.userRole as string | null;
      if (!can(userRole, "admin.settings",)) {
        return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
      }

      try {
        const runtime = getRuntimeNsfwConfig();

        const config: NsfwAdminConfig = {
          // Runtime store is the source of truth for enforcement, so the
          // panel always reflects the live (file/DB/admin-updated) values.
          allowNsfw: runtime.allowNsfw,
          nsfwMinAge: runtime.nsfwMinAge,
        };

        return jsonResponse(config,);
      } catch (error) {
        log().error(`Failed to get NSFW config: ${String(error,)}`,);
        return jsonError({
          message: "Failed to get NSFW config",
          status: HttpStatus.InternalServerError,
        },);
      }
    },)
    // ── Update NSFW config ────────────────────────────────
    .put(
      `${prefix}/admin/nsfw`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = ctx.userRole as string | null;
        if (!can(userRole, "admin.settings",)) {
          return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
        }

        const body = ctx.body as {
          allowNsfw?: boolean;
          nsfwMinAge?: number;
        };

        try {
          let requiresRestart = false;
          if (body.allowNsfw !== undefined) {
            requiresRestart = await setConfig(
              database,
              NSFW_ALLOW_KEY,
              String(body.allowNsfw,),
              "Allow NSFW content in chats",
            );
          }

          if (body.nsfwMinAge !== undefined) {
            const age = Math.max(13, Math.min(25, body.nsfwMinAge,),);
            const rr = await setConfig(database, NSFW_MIN_AGE_KEY, String(age,), "Minimum age for NSFW content",);
            requiresRestart = requiresRestart || rr;
          }

          // Persisting is not enough: enforcement (and the GET above) read the
          // runtime store, which hot-apply only mutates when a config snapshot
          // exists. Apply directly so the toggle is live either way.
          const patch: Partial<NsfwRuntimeConfig> = {};
          if (body.allowNsfw !== undefined) { patch.allowNsfw = body.allowNsfw; }
          if (body.nsfwMinAge !== undefined) {
            patch.nsfwMinAge = Math.max(13, Math.min(25, body.nsfwMinAge,),);
          }

          if (Object.keys(patch,).length > 0) { updateRuntimeNsfwConfig(patch,); }

          log().info(`NSFW config updated by ${userId}`,);
          return jsonResponse({ ok: true, requires_restart: requiresRestart, },);
        } catch (error) {
          log().error(`Failed to update NSFW config: ${String(error,)}`,);
          return jsonError({
            message: "Failed to update NSFW config",
            status: HttpStatus.InternalServerError,
          },);
        }
      },
    )
    // ── List character NSFW policies ──────────────────────
    .get(`${prefix}/admin/nsfw/policy`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const userRole = ctx.userRole as string | null;
      if (!can(userRole, "admin.settings",)) {
        return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
      }

      try {
        const policies = await database
          .selectFrom("actors",)
          .select(["id", "display_name", "content_rating",],)
          .where("content_rating", "!=", "sfw",)
          .execute();

        return jsonResponse(policies,);
      } catch (error) {
        log().error(`Failed to list NSFW policies: ${String(error,)}`,);
        return jsonError({
          message: "Failed to list NSFW policies",
          status: HttpStatus.InternalServerError,
        },);
      }
    },);
}
