// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 282

/**
 * Character Licensing Routes
 *
 * API endpoints for managing character licensing,
 * including CC0 public domain and custom licenses.
 */
import { Elysia, t, } from "elysia";
import { type Kysely, } from "kysely";
import type { LicenseType, } from "../db/enums";
import type { DB, } from "../db/schema";
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

/** Effective licensing values recorded in the audit history. */
interface LicenseHistoryRow {
  license_type: string;
  custom_license_text: string | null;
  attribution: string | null;
  allow_derivatives: number;
  allow_commercial: number;
  share_alike: number;
}

/**
 * Record a licensing change in the audit history (TASK-030).
 * @param database
 * @param actorId
 * @param row
 * @param changedBy
 */
async function recordLicenseHistory(
  database: Kysely<DB>,
  actorId: string,
  row: LicenseHistoryRow,
  changedBy: string,
): Promise<void> {
  await database
    .insertInto("character_license_history",)
    .values({
      id: crypto.randomUUID(),
      actor_id: actorId,
      ...row,
      changed_by: changedBy,
    },)
    .execute();
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

      if (existing) {
        const effective: LicenseHistoryRow & { license_type: LicenseType } = {
          license_type: license_type ?? existing.license_type,
          custom_license_text: custom_license_text ?? existing.custom_license_text,
          attribution: attribution ?? existing.attribution,
          allow_derivatives: booleanToInt(allow_derivatives, existing.allow_derivatives,),
          allow_commercial: booleanToInt(allow_commercial, existing.allow_commercial,),
          share_alike: booleanToInt(share_alike, existing.share_alike,),
        };
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
      const created: LicenseHistoryRow & { license_type: LicenseType } = {
        license_type: license_type ?? "proprietary",
        custom_license_text: custom_license_text ?? null,
        attribution: attribution ?? null,
        allow_derivatives: booleanToInt(allow_derivatives, 1,),
        allow_commercial: booleanToInt(allow_commercial, 0,),
        share_alike: booleanToInt(share_alike, 0,),
      };
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
