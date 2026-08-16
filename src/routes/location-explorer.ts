// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/location-explorer.ts
//
// Location explorer + detail — read-only data feeds for the world location
// browser UI. Reuses the existing `locations` + `location_states` tables and the
// existing location CRUD in routes/worlds.ts; this module only exposes the full
// (unpaginated) tree data + enriched detail the explorer/detail panels need.
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { WorldVisibility, } from "../db/enums-story";
import type { DB, } from "../db/schema";
import { safeJsonParse, } from "../utils";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, } from "../validation/schemas";
import { jsonResponse, requireUserId, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

/** World access (owner, admin, member, or public+authenticated). Returns a denied Response or null when OK. */
async function requireWorldAccess(
  database: Kysely<DB>,
  worldId: string,
  userId: string,
  userRole: string | null,
): Promise<Response | null> {
  const world = await database
    .selectFrom("worlds",)
    .select(["owner_id", "visibility",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!world) { return notFound("World not found",); }
  if (userRole === "admin" || world.owner_id === userId) { return null; }
  if (world.visibility === WorldVisibility.Public) { return null; }
  const member = await database
    .selectFrom("world_members",)
    .select("actor_id",)
    .where("world_id", "=", worldId,)
    .where("actor_id", "=", userId,)
    .executeTakeFirst();
  if (member) { return null; }
  return notFound("World not found",);
}

export function locationExplorerRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "location-explorer", },)
      // ── Explore tree (all locations + states, no paging) ─
      .get(
        `${prefix}/worlds/:worldId/location-explorer`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const worldId = ctx.params.worldId as string;
          const worldErr = await requireWorldAccess(database, worldId, userId, ctx.userRole as string | null,);
          if (worldErr) { return worldErr; }

          const locations = await database
            .selectFrom("locations",)
            .selectAll()
            .where("world_id", "=", worldId,)
            .orderBy("name", "asc",)
            .execute();

          const states = await database
            .selectFrom("location_states",)
            .selectAll()
            .where("world_id", "=", worldId,)
            .execute();

          return jsonResponse({ data: { locations, states, }, },);
        },
        {
          params: t.Object({ worldId: t.String(), },),
          response: {
            200: t.Any(),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Location explorer data",
            description: "All locations and location states for a world (unpaginated) to build the explorer tree.",
            tags: ["Worlds", "Locations",],
          },
        },
      )
      // ── Location detail (resolved connections + states) ──
      .get(
        `${prefix}/worlds/:worldId/locations/:locId/details`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const worldId = ctx.params.worldId as string;
          const locId = ctx.params.locId as string;
          const worldErr = await requireWorldAccess(database, worldId, userId, ctx.userRole as string | null,);
          if (worldErr) { return worldErr; }

          const location = await database
            .selectFrom("locations",)
            .selectAll()
            .where("id", "=", locId,)
            .where("world_id", "=", worldId,)
            .executeTakeFirst();
          if (!location) { return notFound("Location not found",); }

          const state = await database
            .selectFrom("location_states",)
            .selectAll()
            .where("location_id", "=", locId,)
            .where("world_id", "=", worldId,)
            .executeTakeFirst();

          // Resolve connection ids → { id, name } for display.
          const parsed = safeJsonParse<string[]>(location.connections,);
          const connectionIds = parsed.ok ? parsed.value : [];
          const connected = connectionIds.length > 0
            ? await database
              .selectFrom("locations",)
              .select(["id", "name",],)
              .where("id", "in", connectionIds,)
              .where("world_id", "=", worldId,)
              .execute()
            : [];

          const parent = location.parent_location_id
            ? await database
              .selectFrom("locations",)
              .select(["id", "name",],)
              .where("id", "=", location.parent_location_id,)
              .executeTakeFirst()
            : null;

          return jsonResponse({ data: { ...location, state, connections: connected, parent, }, },);
        },
        {
          params: t.Object({ worldId: t.String(), locId: t.String(), },),
          response: {
            200: t.Any(),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Location detail",
            description: "A location with its state, resolved connection names, and parent.",
            tags: ["Worlds", "Locations",],
          },
        },
      )
  );
}
