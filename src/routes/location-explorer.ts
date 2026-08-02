// src/routes/location-explorer.ts
//
// Location explorer + detail — read-only data feeds for the world location
// browser UI. Reuses the existing `locations` + `location_states` tables and the
// existing location CRUD in routes/worlds.ts; this module only exposes the full
// (unpaginated) tree data + enriched detail the explorer/detail panels need.
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { safeJsonParse, } from "../utils";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, } from "../validation/schemas";
import { jsonResponse, requireUserId, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

/** World access (owner or admin). Returns a denied Response or null when OK. */
async function requireWorldAccess(
  database: Kysely<DB>,
  worldId: string,
  userId: string,
  userRole: string | null,
): Promise<Response | null> {
  const world = await database
    .selectFrom("worlds",)
    .select("owner_id",)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin")) {
    return notFound("World not found",);
  }
  return null;
}

export function locationExplorerRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "location-explorer", },)
      // ── Explore tree (all locations + states, no paging) ─
      .get(
        "/api/worlds/:worldId/location-explorer",
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
        "/api/worlds/:worldId/locations/:locId/details",
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
