// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Availability Routes
 *
 * API endpoints for managing character availability status,
 * usage policies, activity restrictions, and content policies.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonStringifyOr, } from "../utils";
import { ActorIdParams, AvailabilityBody, SuccessResponse, } from "../validation/schemas";
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, requireUserId, routeSpec, } from "./http-utils";

/**
 * @param ctx - route context holding the session identity and the actor id param
 * @param database - database handle
 * @returns the actorId, or a 401/404 response to return
 */
async function requireActorAccess(
  ctx: any,
  database: Kysely<DB>,
): Promise<{ actorId: string } | Response> {
  const userId = requireUserId(ctx,);
  if (userId instanceof Response) { return userId; }
  const { actorId, } = ctx.params;
  if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
    return jsonError({
      message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
      status: HttpStatus.NotFound,
    },);
  }

  return { actorId, };
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { actors: { ":actorId": { ...; }; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function characterAvailabilityRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "character-availability", },)
    // ── Get availability for an actor ──────────────────────────
    .get(
      `${prefix}/actors/:actorId/availability`,
      // ctx.t is derive-only (absent from Elysia Context); keep `any` here for the i18n lookup.
      async (ctx: any,) => {
        const access = await requireActorAccess(ctx, database,);
        if (access instanceof Response) { return access; }
        const { actorId, } = access;

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
      },
      {
        params: ActorIdParams,
        ...routeSpec({
          response: { 200: SuccessResponse, },
          summary: "Get character availability settings",
          description:
            "Returns the availability status, usage policy, activity restrictions, and content policy for the specified actor.",
          tags: ["Characters", "Availability",],
        },),
      },
    )
    // ── Create or update availability ──────────────────────────
    .post(
      `${prefix}/actors/:actorId/availability`,
      async (ctx,) => {
        const access = await requireActorAccess(ctx, database,);
        if (access instanceof Response) { return access; }
        const { actorId, } = access;
        const { status, usage_policy, activity_restrictions, content_policy, nsfw_policy, } = ctx.body;

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
              usage_policy: usage_policy ?? existing.usage_policy,
              activity_restrictions: activity_restrictions
                ? jsonStringifyOr(activity_restrictions,)
                : existing.activity_restrictions,
              content_policy: content_policy ?? existing.content_policy,
              nsfw_policy: nsfw_policy ?? existing.nsfw_policy,
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
            usage_policy: usage_policy ?? null,
            activity_restrictions: activity_restrictions ? jsonStringifyOr(activity_restrictions,) : "[]",
            content_policy: content_policy ?? null,
            nsfw_policy: nsfw_policy ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },)
          .execute();

        return jsonCreated({ id, },);
      },
      {
        params: ActorIdParams,
        body: AvailabilityBody,
        ...routeSpec({
          response: { 200: SuccessResponse, },
          summary: "Create or update character availability",
          description:
            "Upserts availability settings for an actor including status, usage policy, activity restrictions, content policy, and NSFW policy.",
          tags: ["Characters", "Availability",],
        },),
      },
    )
    // ── Delete availability ────────────────────────────────────
    .delete(
      `${prefix}/actors/:actorId/availability`,
      async (ctx,) => {
        const access = await requireActorAccess(ctx, database,);
        if (access instanceof Response) { return access; }
        const { actorId, } = access;

        await database
          .deleteFrom("character_availability",)
          .where("actor_id", "=", actorId,)
          .execute();

        return jsonResponse({ ok: true, },);
      },
      {
        params: ActorIdParams,
        ...routeSpec({
          response: { 200: SuccessResponse, },
          summary: "Delete character availability settings",
          description: "Removes all availability settings for the specified actor.",
          tags: ["Characters", "Availability",],
        },),
      },
    );
}
