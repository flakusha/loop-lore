/**
 * Story State Routes
 *
 * Exposes WorldStateService for read access to NPC states, location states,
 * world snapshots, and NPCs-at-location queries:
 *   GET  /api/worlds/:worldId/npc-states/:actorId    — get NPC state
 *   PUT  /api/worlds/:worldId/npc-states/:actorId    — update NPC state
 *   GET  /api/worlds/:worldId/npcs-at/:locationId    — list NPCs at location
 *   GET  /api/locations/:id/state            — get location state
 *   PUT  /api/locations/:id/state            — update location state
 *   GET  /api/worlds/:worldId/states                 — list world snapshots (paginated)
 *   POST /api/worlds/:worldId/states                 — take snapshot
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { notifyGmAction, } from "../notifications/service";
import { WorldStateService, } from "../story/world-state";
import { safeJsonStringify, } from "../utils";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, Id, LocationStateBody, NpcStateBody, PaginationQuery, SuccessResponse, WorldStateCreateBody, } from "../validation/schemas";
import { HttpStatus, jsonCreated, jsonError, jsonPaginated, jsonResponse, } from "./http-utils";

// ── Handlers ────────────────────────────────────────────────

async function handleNpcState(
  database: Kysely<DB>,
  method: string,
  worldId: string,
  actorId: string,
  userId: string | null,
  userRole: string | null,
  body?: Record<string, unknown>,
) {
  const worldCheck = await database
    .selectFrom("worlds",)
    .select(["owner_id",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!worldCheck || (worldCheck.owner_id !== userId && userRole !== "admin")) {
    return jsonError({ message: "NPC state not found", status: HttpStatus.NotFound, },);
  }

  const state = new WorldStateService(database,);
  if (method === "GET") {
    const npcState = await state.getNpcState(actorId, worldId,);
    if (!npcState) { return notFound("NPC state not found",); }
    return jsonResponse(npcState,);
  }

  const updates: Record<string, unknown> = {};
  const intFields: Record<string, string> = { health: "health", };
  const strFields: Record<string, string> = { mentalState: "mental_state", };
  const jsonFields: Record<string, string> = {
    knowledge: "knowledge",
    relationships: "relationships",
    inventory: "inventory",
    schedule: "schedule",
  };

  for (const [k, col,] of Object.entries(intFields,)) {
    if (body?.[k] != null) { updates[col] = body[k]; }
  }
  for (const [k, col,] of Object.entries(strFields,)) {
    if (body?.[k] != null) { updates[col] = body[k]; }
  }
  for (const [k, col,] of Object.entries(jsonFields,)) {
    if (body?.[k] == null) {
      continue;
    }

    const r = safeJsonStringify(body[k],);
    if (r.ok) { updates[col] = r.value; }
  }
  if (body?.locationId != null) { updates.location_id = body.locationId; }
  updates.updated_at = new Date().toISOString();

  await database
    .updateTable("npc_states",)
    .set(updates,)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .execute();

  const updated = await state.getNpcState(actorId, worldId,);
  void notifyGmAction(database, {
    worldId,
    description: `NPC ${actorId} state updated`,
  },).catch(() => {},);
  return jsonResponse(updated,);
}

async function handleNpcsAtLocation(
  database: Kysely<DB>,
  worldId: string,
  locationId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldCheck = await database
    .selectFrom("worlds",)
    .select(["owner_id",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!worldCheck || (worldCheck.owner_id !== userId && userRole !== "admin")) {
    return jsonError({ message: "Location not found", status: HttpStatus.NotFound, },);
  }

  const state = new WorldStateService(database,);
  const npcs = await state.getNpcsAtLocation(locationId,);
  return jsonResponse(npcs,);
}

async function handleLocationState(
  database: Kysely<DB>,
  method: string,
  locationId: string,
  userId: string | null,
  userRole: string | null,
  body?: Record<string, unknown>,
) {
  const locWorld = await database
    .selectFrom("location_states",)
    .innerJoin("worlds", "worlds.id", "location_states.world_id",)
    .select(["worlds.owner_id",],)
    .where("location_states.location_id", "=", locationId,)
    .executeTakeFirst();
  if (!locWorld || (locWorld.owner_id !== userId && userRole !== "admin")) {
    return jsonError({ message: "Location not found", status: HttpStatus.NotFound, },);
  }

  const state = new WorldStateService(database,);
  if (method === "GET") {
    const locState = await state.getLocationState(locationId,);
    if (!locState) { return notFound("Location state not found",); }
    return jsonResponse(locState,);
  }

  const updates: Record<string, unknown> = {};
  const strFields = ["description_override", "atmosphere", "time_of_day", "weather",] as const;
  const jsonFields: Record<string, string> = {
    npcsPresent: "npcs_present",
    itemsAvailable: "items_available",
    hazards: "hazards",
  };

  for (const f of strFields) {
    if (body?.[f] != null) { updates[f] = body[f]; }
  }
  for (const [k, col,] of Object.entries(jsonFields,)) {
    if (body?.[k] == null) {
      continue;
    }

    const r = safeJsonStringify(body[k],);
    if (r.ok) { updates[col] = r.value; }
  }
  updates.updated_at = new Date().toISOString();

  await database.updateTable("location_states",).set(updates,).where("location_id", "=", locationId,).execute();
  const locWorldRow = await database
    .selectFrom("location_states",)
    .select("world_id",)
    .where("location_id", "=", locationId,)
    .executeTakeFirst();
  if (locWorldRow) {
    void notifyGmAction(database, {
      worldId: locWorldRow.world_id,
      description: `Location ${locationId} state updated`,
    },).catch(() => {},);
  }
  const updated = await state.getLocationState(locationId,);
  return jsonResponse(updated,);
}

async function handleWorldStates(
  database: Kysely<DB>,
  method: string,
  worldId: string,
  userId: string | null,
  userRole: string | null,
  page: number,
  pageSize: number,
  body?: Record<string, unknown>,
) {
  const worldCheck = await database
    .selectFrom("worlds",)
    .select(["owner_id",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!worldCheck || (worldCheck.owner_id !== userId && userRole !== "admin")) {
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, },);
  }

  const state = new WorldStateService(database,);
  if (method === "GET") {
    const offset = (page - 1) * pageSize;
    const countResult = await database
      .selectFrom("world_states",)
      .select(database.fn.countAll<number>().as("total",),)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();
    const total = countResult?.total ?? 0;
    const snapshots = await database
      .selectFrom("world_states",)
      .selectAll()
      .where("world_id", "=", worldId,)
      .orderBy("created_at", "desc",)
      .limit(pageSize,)
      .offset(offset,)
      .execute();
    return jsonPaginated({ data: snapshots, total, page, pageSize, },);
  }

  const id = await state.snapshot(
    worldId,
    (body?.turnId as string) ?? undefined,
    (body?.messageId as string) ?? undefined,
    (body?.description as string) ?? undefined,
  );
  return jsonCreated({ id, },);
}

// ── Elysia plugin ───────────────────────────────────────────

export function storyStatesRoutes({ database, }: { database: Kysely<DB> },): Elysia {
  return new Elysia({ name: "story-states", },)
    .get("/api/worlds/:worldId/npc-states/:actorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, actorId, } = ctx.params;
      return handleNpcState(database, "GET", worldId, actorId, userId, userRole,);
    }, {
      params: t.Object({ worldId: Id, actorId: Id, },),
      response: {
        200: t.Object({ id: t.String(), actorId: t.String(), worldId: t.Optional(t.String(),), status: t.Optional(t.String(),), },),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get NPC state",
        description: "Get the current state of an NPC in a world.",
        tags: ["Story States",],
      },
    },)
    .put("/api/worlds/:worldId/npc-states/:actorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, actorId, } = ctx.params;
      return handleNpcState(database, "PUT", worldId, actorId, userId, userRole, ctx.body as Record<string, unknown>,);
    }, {
      params: t.Object({ worldId: Id, actorId: Id, },),
      body: NpcStateBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Update NPC state",
        description: "Update the state of an NPC in a world (location, status, mood, etc).",
        tags: ["Story States",],
      },
    },)
    .get("/api/worlds/:worldId/npcs-at/:locationId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, locationId, } = ctx.params;
      return handleNpcsAtLocation(database, worldId, locationId, userId, userRole,);
    }, {
      params: t.Object({ worldId: Id, locationId: Id, },),
      response: {
        200: t.Array(t.Object({ actorId: t.String(), displayName: t.String(), },),),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List NPCs at location",
        description: "List all NPCs currently at a specific location in a world.",
        tags: ["Story States",],
      },
    },)
    .get("/api/locations/:id/state", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleLocationState(database, "GET", ctx.params.id, userId, userRole,);
    }, {
      params: t.Object({ id: Id, },),
      response: {
        200: t.Object({ id: t.String(), locationId: t.String(), state: t.Record(t.String(), t.Any(),), },),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get location state",
        description: "Get the current state of a location.",
        tags: ["Story States",],
      },
    },)
    .put("/api/locations/:id/state", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleLocationState(
        database,
        "PUT",
        ctx.params.id,
        userId,
        userRole,
        ctx.body as Record<string, unknown>,
      );
    }, {
      params: t.Object({ id: Id, },),
      body: LocationStateBody,
      detail: {
        summary: "Update location state",
        description: "Update the state of a location (weather, time of day, events, etc).",
        tags: ["Story States",],
      },
    },)
    .get("/api/worlds/:worldId/states", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, } = ctx.params;
      return handleWorldStates(
        database,
        "GET",
        worldId,
        userId,
        userRole,
        Number(ctx.query?.page,) || 1,
        Number(ctx.query?.pageSize,) || 20,
      );
    }, {
      params: t.Object({ worldId: Id, },),
      query: PaginationQuery,
      detail: {
        summary: "List world states",
        description: "List all world states for a world. Paginated.",
        tags: ["Story States",],
      },
    },)
    .post("/api/worlds/:worldId/states", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, } = ctx.params;
      return handleWorldStates(
        database,
        "POST",
        worldId,
        userId,
        userRole,
        1,
        20,
        ctx.body as Record<string, unknown>,
      );
    }, {
      params: t.Object({ worldId: Id, },),
      body: WorldStateCreateBody,
      detail: {
        summary: "Create world state",
        description: "Create a new world state snapshot for a world.",
        tags: ["Story States",],
      },
    },) as unknown as Elysia;
}
