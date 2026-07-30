/**
 * Admin Character Overrides Routes
 *
 * API endpoints for admin-level character management:
 * visibility overrides, license overrides, bans, approvals, restrictions.
 * Requires admin role.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
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

      const { actorId, } = ctx.params as { actorId: string };
      const body = ctx.body as Record<string, unknown>;

      const action = body.action as string | undefined;
      const visibilityOverride = body.visibilityOverride as string | undefined;
      const licenseOverride = body.licenseOverride as string | undefined;
      const reason = body.reason as string | undefined;
      const expiresAt = body.expiresAt as string | undefined;

      if (!action) {
        return jsonError({ message: "action is required", status: HttpStatus.BadRequest, },);
      }

      const id = crypto.randomUUID();
      await database
        .insertInto("admin_character_overrides",)
        .values({
          id,
          actor_id: actorId,
          admin_id: userId,
          action: action as any,
          visibility_override: (visibilityOverride as any) ?? null,
          license_override: (licenseOverride as any) ?? null,
          reason: reason ?? null,
          expires_at: expiresAt ?? null,
          created_at: new Date().toISOString(),
        },)
        .execute();

      return jsonCreated({ id, },);
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
    },);
}
