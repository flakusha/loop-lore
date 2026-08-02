/**
 * Character Availability Routes
 *
 * API endpoints for managing character availability status,
 * usage policies, activity restrictions, and content policies.
 */
import { Elysia, } from "elysia";
import { ActorIdParams, AvailabilityBody, ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, requireUserId, } from "./http-utils";

export function characterAvailabilityRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return new Elysia({ name: "character-availability", },)
    // ── Get availability for an actor ──────────────────────────
    .get("/api/actors/:actorId/availability", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const availability = await database
        .selectFrom("character_availability",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();

      if (!availability) {
        return jsonError({
          message: ctx.t?.("characters.availabilityNotFound",) ?? "Availability not found",
          status: HttpStatus.NotFound,
        },);
      }
      return jsonResponse(availability,);
    }, {
      params: ActorIdParams,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get character availability settings",
        description:
          "Returns the availability status, usage policy, activity restrictions, and content policy for the specified actor.",
        tags: ["Characters", "Availability",],
      },
    },)
    // ── Create or update availability ──────────────────────────
    .post("/api/actors/:actorId/availability", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const { status, usagePolicy, activityRestrictions, contentPolicy, nsfwPolicy, } = ctx.body;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      // Upsert
      const existing = await database
        .selectFrom("character_availability",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();

      if (existing) {
        await database
          .updateTable("character_availability",)
          .set({
            status: status ?? existing.status,
            usage_policy: usagePolicy ?? existing.usage_policy,
            activity_restrictions: activityRestrictions
              ? JSON.stringify(activityRestrictions,)
              : existing.activity_restrictions,
            content_policy: contentPolicy ?? existing.content_policy,
            nsfw_policy: nsfwPolicy ?? existing.nsfw_policy,
            updated_at: new Date().toISOString(),
          },)
          .where("id", "=", existing.id,)
          .execute();
        return jsonResponse({ id: existing.id, updated: true, },);
      }

      const id = crypto.randomUUID();
      await database
        .insertInto("character_availability",)
        .values({
          id,
          actor_id: actorId,
          status: status ?? "available",
          usage_policy: usagePolicy ?? null,
          activity_restrictions: activityRestrictions ? JSON.stringify(activityRestrictions,) : "[]",
          content_policy: contentPolicy ?? null,
          nsfw_policy: nsfwPolicy ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },)
        .execute();

      return jsonCreated({ id, },);
    }, {
      params: ActorIdParams,
      body: AvailabilityBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Create or update character availability",
        description:
          "Upserts availability settings for an actor including status, usage policy, activity restrictions, content policy, and NSFW policy.",
        tags: ["Characters", "Availability",],
      },
    },)
    // ── Delete availability ────────────────────────────────────
    .delete("/api/actors/:actorId/availability", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      await database
        .deleteFrom("character_availability",)
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
        summary: "Delete character availability settings",
        description: "Removes all availability settings for the specified actor.",
        tags: ["Characters", "Availability",],
      },
    },);
}
