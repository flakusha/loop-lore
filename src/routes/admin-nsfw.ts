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
import { getConfig, setConfig, } from "../admin/config";
import type { DB, } from "../db/schema";
import type { TranslatorFn, } from "../i18n/types";
import { getLogger, type Logger, } from "../logger";
import { jsonError, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "admin-nsfw", },);
}

/** Config keys */
const NSFW_ALLOW_KEY = "nsfw_allow";
const NSFW_MIN_AGE_KEY = "nsfw_min_age";

interface NsfwAdminConfig {
  allowNsfw: boolean;
  nsfwMinAge: number;
}

export function adminNsfwRoutes({ database, }: { database: Kysely<DB> },) {
  return new Elysia({ name: "admin-nsfw", },)
    // ── Get NSFW config ───────────────────────────────────
    .get("/api/admin/nsfw", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }
      if (userRole !== "admin") {
        return jsonError({ message: "errors.forbidden", status: HttpStatus.Forbidden, t, },);
      }

      try {
        const allowRaw = await getConfig(database, NSFW_ALLOW_KEY,);
        const minAgeRaw = await getConfig(database, NSFW_MIN_AGE_KEY,);

        const config: NsfwAdminConfig = {
          allowNsfw: allowRaw ? allowRaw.value === "true" : true,
          nsfwMinAge: minAgeRaw ? parseInt(minAgeRaw.value, 10,) || 18 : 18,
        };

        return jsonResponse(config,);
      } catch (error) {
        log().error(`Failed to get NSFW config: ${String(error,)}`,);
        return jsonError({
          message: "errors.serverError",
          status: HttpStatus.InternalServerError,
          t,
        },);
      }
    },)
    // ── Update NSFW config ────────────────────────────────
    .put(
      "/api/admin/nsfw",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const userRole = ctx.userRole as string | null;
        const t = ctx.t as TranslatorFn | undefined;
        if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }
        if (userRole !== "admin") {
          return jsonError({
            message: "errors.forbidden",
            status: HttpStatus.Forbidden,
            t,
          },);
        }

        const body = ctx.body as {
          allowNsfw?: boolean;
          nsfwMinAge?: number;
        };

        try {
          if (body.allowNsfw !== undefined) {
            await setConfig(database, NSFW_ALLOW_KEY, String(body.allowNsfw,), "Allow NSFW content in chats",);
          }
          if (body.nsfwMinAge !== undefined) {
            const age = Math.max(13, Math.min(25, body.nsfwMinAge,),);
            await setConfig(database, NSFW_MIN_AGE_KEY, String(age,), "Minimum age for NSFW content",);
          }

          log().info(`NSFW config updated by ${userId}`,);
          return jsonResponse({ ok: true, },);
        } catch (error) {
          log().error(`Failed to update NSFW config: ${String(error,)}`,);
          return jsonError({
            message: "errors.serverError",
            status: HttpStatus.InternalServerError,
            t,
          },);
        }
      },
    )
    // ── List character NSFW policies ──────────────────────
    .get("/api/admin/nsfw/policy", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }
      if (userRole !== "admin") {
        return jsonError({ message: "errors.forbidden", status: HttpStatus.Forbidden, t, },);
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
          message: "errors.serverError",
          status: HttpStatus.InternalServerError,
          t,
        },);
      }
    },);
}
