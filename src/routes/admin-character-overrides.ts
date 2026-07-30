/**
 * Admin Character Overrides Routes
 *
 * API endpoints for admin-level character management:
 * visibility overrides, license overrides, bans, approvals, restrictions.
 * Requires admin role.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import { AdminOverrideCreateBody, ErrorResponse, Id, SuccessResponse, } from "../validation/schemas";
import { jsonCreated, jsonError, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function adminCharacterOverridesRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return new Elysia({ name: "admin-character-overrides", },)
    // ── List all overrides (admin only) ──────────────────────
    .get("/api/admin/character-overrides", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }
      if (userRole !== "admin") {
        return jsonError({
          message: ctx.t?.("errors.forbidden",) ?? "Forbidden",
          status: HttpStatus.Forbidden,
        },);
      }

      const overrides = await database
        .selectFrom("admin_character_overrides",)
        .selectAll()
        .execute();

      return jsonResponse(overrides,);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "List all character overrides",
        description: "Returns all admin character overrides across all actors. Requires admin role.",
        tags: ["Admin", "Characters",],
      },
    },)
    // ── List overrides for a specific actor ────────────────────
    .get("/api/admin/actors/:actorId/overrides", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }
      if (userRole !== "admin") {
        return jsonError({
          message: ctx.t?.("errors.forbidden",) ?? "Forbidden",
          status: HttpStatus.Forbidden,
        },);
      }

      const { actorId, } = ctx.params as { actorId: string };

      const overrides = await database
        .selectFrom("admin_character_overrides",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .execute();

      return jsonResponse(overrides,);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "List overrides for a specific actor",
        description: "Returns all character overrides for a specific actor. Requires admin role.",
        tags: ["Admin", "Characters",],
      },
    },)
    // ── Create a new override ──────────────────────────────────
    .post("/api/admin/actors/:actorId/overrides", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }
      if (userRole !== "admin") {
        return jsonError({
          message: ctx.t?.("errors.forbidden",) ?? "Forbidden",
          status: HttpStatus.Forbidden,
        },);
      }

      const { actorId, } = ctx.params;
      const { action, visibilityOverride, licenseOverride, reason, expiresAt, } = ctx.body;

      const id = crypto.randomUUID();
      await database
        .insertInto("admin_character_overrides",)
        .values({
          id,
          actor_id: actorId,
          admin_id: userId,
          action,
          visibility_override: visibilityOverride ?? null,
          license_override: licenseOverride ?? null,
          reason: reason ?? null,
          expires_at: expiresAt ?? null,
          created_at: new Date().toISOString(),
        },)
        .execute();

      return jsonCreated({ id, },);
    }, {
      params: t.Object({ actorId: Id, },),
      body: AdminOverrideCreateBody,
      response: {
        201: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Create a character override",
        description:
          "Creates a new admin override for a specific actor with action, visibility, license, reason, and expiration.",
        tags: ["Admin", "Characters",],
      },
    },)
    // ── Delete an override ─────────────────────────────────────
    .delete("/api/admin/character-overrides/:overrideId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }
      if (userRole !== "admin") {
        return jsonError({
          message: ctx.t?.("errors.forbidden",) ?? "Forbidden",
          status: HttpStatus.Forbidden,
        },);
      }

      const { overrideId, } = ctx.params as { overrideId: string };

      await database
        .deleteFrom("admin_character_overrides",)
        .where("id", "=", overrideId,)
        .execute();

      return jsonResponse({ ok: true, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Delete a character override",
        description: "Removes an admin character override by ID. Requires admin role.",
        tags: ["Admin", "Characters",],
      },
    },);
}
