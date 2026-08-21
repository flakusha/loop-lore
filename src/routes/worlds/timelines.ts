// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Timeline CRUD routes — world-scoped timeline branch management.
 */
import { Elysia, t } from "elysia";
import {
  extractAuth,
  jsonCreated,
  notFoundResponse as notFound,
  unauthorizedResponse,
  badRequestResponse,
} from "../http-utils/index.js";
import { requireWorldOwner } from "./access";
import type { HandleOpts } from "./types";

export function timelinesRoutes(opts: HandleOpts, prefix = "/api") {
  const { database } = opts;

  return (
    new Elysia({ name: "worlds-timelines" })
      // GET /worlds/:worldId/timelines — list all timelines for a world
      .get(
        `${prefix}/worlds/:worldId/timelines`,
        async (ctx) => {
          const { worldId } = ctx.params;
          const timelines = await database
            .selectFrom("world_timelines")
            .select(["id", "world_id", "name", "description", "is_prime", "created_at"])
            .where("world_id", "=", worldId)
            .orderBy("is_prime", "desc")
            .execute();
          return jsonCreated({ data: timelines });
        },
        { params: t.Object({ worldId: t.String() }) },
      )
      // POST /worlds/:worldId/timelines — create a new timeline branch
      .post(
        `${prefix}/worlds/:worldId/timelines`,
        async (ctx) => {
          const { worldId } = ctx.params;
          const body = ctx.body as { name: string; description?: string };

          const world = await database
            .selectFrom("worlds")
            .select("id")
            .where("id", "=", worldId)
            .executeTakeFirst();
          if (!world) { return notFound("World not found"); }

          const id = crypto.randomUUID();
          await database
            .insertInto("world_timelines")
            .values({
              id,
              world_id: worldId,
              name: body.name,
              description: body.description ?? null,
              is_prime: 0,
              created_at: new Date().toISOString(),
            })
            .execute();

          const row = await database
            .selectFrom("world_timelines")
            .select(["id", "world_id", "name", "description", "is_prime", "created_at"])
            .where("id", "=", id)
            .executeTakeFirst();
          return jsonCreated({ data: row });
        },
        {
          params: t.Object({ worldId: t.String() }),
          body: t.Object({
            name: t.String({ minLength: 1, maxLength: 200 }),
            description: t.Optional(t.String({ maxLength: 1000 })),
          }),
        },
      )
      // GET /worlds/:worldId/timelines/:timelineId — get one timeline
      .get(
        `${prefix}/worlds/:worldId/timelines/:timelineId`,
        async (ctx) => {
          const { worldId, timelineId } = ctx.params;
          const row = await database
            .selectFrom("world_timelines")
            .select(["id", "world_id", "name", "description", "is_prime", "created_at"])
            .where("id", "=", timelineId)
            .where("world_id", "=", worldId)
            .executeTakeFirst();
          if (!row) { return notFound("Timeline not found"); }
          return jsonCreated({ data: row });
        },
        {
          params: t.Object({ worldId: t.String(), timelineId: t.String() }),
        },
      )
      // DELETE /worlds/:worldId/timelines/:timelineId — delete a non-prime timeline
      .delete(
        `${prefix}/worlds/:worldId/timelines/:timelineId`,
        async (ctx) => {
          const { worldId, timelineId } = ctx.params;
          const auth = extractAuth(ctx);
          if (!auth.userId) { return unauthorizedResponse(); }
          const err = await requireWorldOwner(database, worldId, auth.userId, auth.userRole ?? null);
          if (err) { return err; }

          const row = await database
            .selectFrom("world_timelines")
            .select(["is_prime"])
            .where("id", "=", timelineId)
            .where("world_id", "=", worldId)
            .executeTakeFirst();
          if (!row) { return notFound("Timeline not found"); }
          if (row.is_prime) {
            return badRequestResponse("Cannot delete the prime timeline");
          }

          await database
            .deleteFrom("world_timelines")
            .where("id", "=", timelineId)
            .execute();
          return new Response(null, { status: 204 });
        },
        {
          params: t.Object({ worldId: t.String(), timelineId: t.String() }),
        },
      )
  );
}
