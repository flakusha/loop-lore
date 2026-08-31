// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Licensing Routes
 *
 * API endpoints for managing character licensing,
 * including CC0 public domain and custom licenses.
 */
import { Elysia, } from "elysia";
import { ActorIdParams, ErrorResponse, LicensingBody, SuccessResponse, } from "../validation/schemas";
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, requireUserId, } from "./http-utils";

/**
 * Convert boolean to 0/1 integer, with fallback for undefined.
 * @param value
 * @param fallback
 */
function booleanToInt(value: boolean | undefined, fallback: number,): number {
  return value === undefined ? fallback : (value ? 1 : 0);
}

/**
 * @param opts
 * @param prefix
 */
export function characterLicensingRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "character-licensing", },)
    // ── Get licensing for an actor ─────────────────────────────
    .get(`${prefix}/actors/:actorId/licensing`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const licensing = await database
        .selectFrom("character_licensing",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();

      if (!licensing) {
        return jsonError({
          message: ctx.t?.("characters.licensingNotFound",) ?? "Licensing not found",
          status: HttpStatus.NotFound,
        },);
      }
      return jsonResponse(licensing,);
    }, {
      params: ActorIdParams,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get character licensing information",
        description: "Returns the licensing details (CC0, custom, or proprietary) for the specified actor.",
        tags: ["Characters", "Licensing",],
      },
    },)
    // ── Create or update licensing ─────────────────────────────
    .post(`${prefix}/actors/:actorId/licensing`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { actorId, } = ctx.params;
      const { license_type, custom_license_text, attribution, allow_derivatives, allow_commercial, share_alike, } =
        ctx.body;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      // Upsert
      const existing = await database
        .selectFrom("character_licensing",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();

      if (existing) {
        await database
          .updateTable("character_licensing",)
          .set({
            license_type: license_type ?? existing.license_type,
            custom_license_text: custom_license_text ?? existing.custom_license_text,
            attribution: attribution ?? existing.attribution,
            allow_derivatives: booleanToInt(allow_derivatives, existing.allow_derivatives,),
            allow_commercial: booleanToInt(allow_commercial, existing.allow_commercial,),
            share_alike: booleanToInt(share_alike, existing.share_alike,),
            updated_at: new Date().toISOString(),
          },)
          .where("id", "=", existing.id,)
          .execute();
        return jsonResponse({ id: existing.id, updated: true, },);
      }

      const id = crypto.randomUUID();
      await database
        .insertInto("character_licensing",)
        .values({
          id,
          actor_id: actorId,
          license_type: license_type ?? "proprietary",
          custom_license_text: custom_license_text ?? null,
          attribution: attribution ?? null,
          allow_derivatives: booleanToInt(allow_derivatives, 1,),
          allow_commercial: booleanToInt(allow_commercial, 0,),
          share_alike: booleanToInt(share_alike, 0,),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },)
        .execute();

      return jsonCreated({ id, },);
    }, {
      params: ActorIdParams,
      body: LicensingBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Create or update character licensing",
        description:
          "Upserts licensing information for an actor including license type, custom text, attribution, and derivative/commercial/share-alike flags.",
        tags: ["Characters", "Licensing",],
      },
    },)
    // ── Delete licensing ───────────────────────────────────────
    .delete(`${prefix}/actors/:actorId/licensing`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      await database
        .deleteFrom("character_licensing",)
        .where("actor_id", "=", actorId,)
        .execute();

      return jsonResponse({ ok: true, },);
    }, {
      params: ActorIdParams,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Delete character licensing",
        description: "Removes all licensing information for the specified actor.",
        tags: ["Characters", "Licensing",],
      },
    },);
}
