// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Licensing Routes
 *
 * API endpoints for managing character licensing,
 * including CC0 public domain and custom licenses.
 * Row composer + audit recorder live in `./character-licensing-helpers`.
 */
import { Elysia, t, } from "elysia";
import { ActorIdParams, ErrorResponse, LicensingBody, SuccessResponse, } from "../validation/schemas";
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import {
  composeLicenseRow,
  recordLicenseHistory,
} from "./character-licensing-helpers";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, requireUserId, } from "./http-utils";

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
    // ── License change history (audit) ───────────────────────
    .get(`${prefix}/actors/:actorId/licensing/history`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const history = await database
        .selectFrom("character_license_history",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .orderBy("created_at", "desc",)
        .execute();

      return jsonResponse(history,);
    }, {
      params: ActorIdParams,
      response: {
        200: t.Any(),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get character licensing change history",
        description: "Returns the audit trail of licensing changes for the specified actor, newest first.",
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

      // BUG-character-licensing-upsert: licenses are character-only. Reject any
      // non-character actor even if the caller owns it, otherwise licensing rows
      // pollute reports that don't filter by actor_type.
      const actorRow = await database
        .selectFrom("actors",)
        .select("actor_type",)
        .where("id", "=", actorId,)
        .executeTakeFirst();
      if (!actorRow || actorRow.actor_type !== "character") {
        return jsonError({
          message: "Licenses are only issued to character actors",
          status: HttpStatus.BadRequest,
        },);
      }

      // Upsert
      const existing = await database
        .selectFrom("character_licensing",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();

      const body = {
        license_type,
        custom_license_text,
        attribution,
        allow_derivatives,
        allow_commercial,
        share_alike,
      };

      if (existing) {
        const effective = composeLicenseRow(existing, body,);
        await database
          .updateTable("character_licensing",)
          .set({
            ...effective,
            updated_at: new Date().toISOString(),
          },)
          .where("id", "=", existing.id,)
          .execute();
        await recordLicenseHistory(database, actorId, effective, userId,);
        return jsonResponse({ id: existing.id, updated: true, },);
      }

      const id = crypto.randomUUID();
      const created = composeLicenseRow(undefined, body,);
      await database
        .insertInto("character_licensing",)
        .values({
          id,
          actor_id: actorId,
          ...created,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },)
        .execute();

      await recordLicenseHistory(database, actorId, created, userId,);

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

      const existing = await database
        .selectFrom("character_licensing",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();

      await database
        .deleteFrom("character_licensing",)
        .where("actor_id", "=", actorId,)
        .execute();

      if (existing) {
        await recordLicenseHistory(database, actorId, {
          license_type: "removed",
          custom_license_text: existing.custom_license_text,
          attribution: existing.attribution,
          allow_derivatives: existing.allow_derivatives,
          allow_commercial: existing.allow_commercial,
          share_alike: existing.share_alike,
        }, userId,);
      }

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
