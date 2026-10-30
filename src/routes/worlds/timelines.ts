// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Timeline CRUD routes — world-scoped timeline branch management.
 *
 * Auth model (mirrors sibling worlds/locations routes):
 *   GET    (list)   — extractAuth → requireWorldAccess (returns 404 to
 *                     hide existence from non-members)
 *   POST   (create) — extractAuth → requireWorldOwner (returns 403)
 *   GET    (one)    — extractAuth → requireWorldAccess (404 to outsiders)
 *   PUT    (update) — extractAuth → requireWorldOwner (403)
 *   DELETE          — extractAuth → requireWorldOwner (403)
 *   POST   (:id/select) — extractAuth → requireWorldAccess: the caller's own
 *                     per-user view row (TASK-timeline-selection-api), not a
 *                     world mutation
 *
 * Unauthenticated callers MUST receive 401 on every verb.
 */
import { Elysia, t, } from "elysia";
import {
  badRequestResponse,
  extractAuth,
  jsonCreated,
  jsonResponse,
  notFoundResponse as notFound,
  unauthorizedResponse,
} from "../http-utils/index.js";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { worlds: { ":worldId": { ...; }; }; }; } & { ...; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function timelinesRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "worlds-timelines", },)
      // GET /worlds/:worldId/timelines — list all timelines for a world
      .get(
        `${prefix}/worlds/:worldId/timelines`,
        async (ctx,) => {
          const { worldId, } = ctx.params;
          const auth = extractAuth(ctx,);
          if (!auth.userId) { return unauthorizedResponse(); }
          const worldErr = await requireWorldAccess(database, worldId, auth.userId, auth.userRole ?? null,);
          if (worldErr) { return worldErr; }

          // One query: timeline rows plus a correlated event-count subquery.
          // The prime branch counts events tagged with the conventional
          // 'prime' slug even when its world_timelines row has a uuid id.
          const timelines = await database
            .selectFrom("world_timelines",)
            .select((eb,) => [
              "id",
              "world_id",
              "name",
              "description",
              "is_prime",
              "created_at",
              eb
                .selectFrom("world_timeline_events",)
                .select((sub,) => sub.fn.countAll<string>().as("event_count",))
                .where("world_id", "=", worldId,)
                .where((web,) =>
                  web.or(
                    [
                      web.eb("timeline_id", "=", eb.ref("world_timelines.id",),),
                      web.and(
                        [
                          eb("world_timelines.is_prime", "=", 1,),
                          web.eb("timeline_id", "=", "prime",),
                        ],
                      ),
                    ],
                  )
                )
                .as("eventCount",),
            ])
            .where("world_id", "=", worldId,)
            .orderBy("is_prime", "desc",)
            .execute();

          const data = timelines.map((row,) => {
            return { ...row, eventCount: Number(row.eventCount,), };
          },);

          return jsonCreated({ data, },);
        },
        { params: t.Object({ worldId: t.String(), },), },
      )
      // POST /worlds/:worldId/timelines — create a new timeline branch
      .post(
        `${prefix}/worlds/:worldId/timelines`,
        async (ctx,) => {
          const { worldId, } = ctx.params;
          const auth = extractAuth(ctx,);
          if (!auth.userId) { return unauthorizedResponse(); }
          const ownerErr = await requireWorldOwner(database, worldId, auth.userId, auth.userRole ?? null,);
          if (ownerErr) { return ownerErr; }
          const body = ctx.body as { name: string; description?: string };

          const id = crypto.randomUUID();
          await database
            .insertInto("world_timelines",)
            .values({
              id,
              world_id: worldId,
              name: body.name,
              description: body.description ?? null,
              is_prime: 0,
              created_at: new Date().toISOString(),
            },)
            .execute();

          const row = await database
            .selectFrom("world_timelines",)
            .select(["id", "world_id", "name", "description", "is_prime", "created_at",],)
            .where("id", "=", id,)
            .executeTakeFirst();

          return jsonCreated({ data: row, },);
        },
        {
          params: t.Object({ worldId: t.String(), },),
          body: t.Object({
            name: t.String({ minLength: 1, maxLength: 200, },),
            description: t.Optional(t.String({ maxLength: 1000, },),),
          },),
        },
      )
      // GET /worlds/:worldId/timelines/:timelineId — get one timeline
      .get(
        `${prefix}/worlds/:worldId/timelines/:timelineId`,
        async (ctx,) => {
          const { worldId, timelineId, } = ctx.params;
          const auth = extractAuth(ctx,);
          if (!auth.userId) { return unauthorizedResponse(); }
          const worldErr = await requireWorldAccess(database, worldId, auth.userId, auth.userRole ?? null,);
          if (worldErr) { return worldErr; }

          const row = await database
            .selectFrom("world_timelines",)
            .select(["id", "world_id", "name", "description", "is_prime", "created_at",],)
            .where("id", "=", timelineId,)
            .where("world_id", "=", worldId,)
            .executeTakeFirst();

          if (!row) { return notFound("Timeline not found",); }
          return jsonCreated({ data: row, },);
        },
        {
          params: t.Object({ worldId: t.String(), timelineId: t.String(), },),
        },
      )
      // DELETE /worlds/:worldId/timelines/:timelineId — delete a non-prime timeline
      .delete(
        `${prefix}/worlds/:worldId/timelines/:timelineId`,
        async (ctx,) => {
          const { worldId, timelineId, } = ctx.params;
          const auth = extractAuth(ctx,);
          if (!auth.userId) { return unauthorizedResponse(); }
          const err = await requireWorldOwner(database, worldId, auth.userId, auth.userRole ?? null,);
          if (err) { return err; }

          const row = await database
            .selectFrom("world_timelines",)
            .select(["is_prime",],)
            .where("id", "=", timelineId,)
            .where("world_id", "=", worldId,)
            .executeTakeFirst();

          if (!row) { return notFound("Timeline not found",); }
          if (row.is_prime) {
            return badRequestResponse("Cannot delete the prime timeline",);
          }

          await database
            .deleteFrom("world_timelines",)
            .where("id", "=", timelineId,)
            .execute();

          return new Response(null, { status: 204, },);
        },
        {
          params: t.Object({ worldId: t.String(), timelineId: t.String(), },),
        },
      )
      // PUT /worlds/:worldId/timelines/:timelineId — update a timeline branch
      .put(
        `${prefix}/worlds/:worldId/timelines/:timelineId`,
        async (ctx,) => {
          const { worldId, timelineId, } = ctx.params;
          const auth = extractAuth(ctx,);
          if (!auth.userId) { return unauthorizedResponse(); }
          const err = await requireWorldOwner(database, worldId, auth.userId, auth.userRole ?? null,);
          if (err) { return err; }
          const body = ctx.body as { name?: string; description?: string };

          // A body with no mutable fields would read as success while
          // changing nothing — reject it instead.
          if (body.name === undefined && body.description === undefined) {
            return badRequestResponse("Provide at least one of name or description",);
          }

          const existing = await database
            .selectFrom("world_timelines",)
            .select(["id",],)
            .where("id", "=", timelineId,)
            .where("world_id", "=", worldId,)
            .executeTakeFirst();

          if (!existing) { return notFound("Timeline not found",); }

          await database
            .updateTable("world_timelines",)
            .set({
              ...(body.name !== undefined ? { name: body.name, } : {}),
              ...(body.description !== undefined ? { description: body.description, } : {}),
            },)
            .where("id", "=", timelineId,)
            .where("world_id", "=", worldId,)
            .execute();

          const updated = await database
            .selectFrom("world_timelines",)
            .select(["id", "world_id", "name", "description", "is_prime", "created_at",],)
            .where("id", "=", timelineId,)
            .executeTakeFirst();

          return jsonResponse({ data: updated, },);
        },
        {
          params: t.Object({ worldId: t.String(), timelineId: t.String(), },),
          body: t.Object({
            name: t.Optional(t.String({ minLength: 1, maxLength: 200, },),),
            description: t.Optional(t.String({ maxLength: 1000, },),),
          },),
        },
      )
      // POST /worlds/:worldId/timelines/:timelineId/select — set the caller's
      // active timeline branch for this world
      .post(
        `${prefix}/worlds/:worldId/timelines/:timelineId/select`,
        async (ctx,) => {
          const { worldId, timelineId, } = ctx.params;
          const auth = extractAuth(ctx,);
          if (!auth.userId) { return unauthorizedResponse(); }
          // A selection is the CALLER's view preference (one row per user per
          // world, TASK-timeline-selection-api), not a world mutation —
          // requireWorldAccess here, unlike the owner-gated create/update/
          // delete. Only the caller's own row is ever written.
          const worldErr = await requireWorldAccess(database, worldId, auth.userId, auth.userRole ?? null,);
          if (worldErr) { return worldErr; }

          const branch = await database
            .selectFrom("world_timelines",)
            .select(["id",],)
            .where("id", "=", timelineId,)
            .where("world_id", "=", worldId,)
            .executeTakeFirst();

          if (!branch) { return notFound("Timeline not found",); }

          const selectedAt = new Date().toISOString();
          await database
            .insertInto("world_timeline_selections",)
            .values({
              user_id: auth.userId,
              world_id: worldId,
              timeline_id: timelineId,
              selected_at: selectedAt,
            },)
            .onConflict((oc,) =>
              oc
                .columns(["user_id", "world_id",],)
                .doUpdateSet({ timeline_id: timelineId, selected_at: selectedAt, },)
            )
            .execute();

          return jsonResponse({ data: { worldId, timelineId, }, },);
        },
        {
          params: t.Object({ worldId: t.String(), timelineId: t.String(), },),
        },
      )
  );
}
