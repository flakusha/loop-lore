/**
 * World Routes
 *
 * CRUD for worlds + nested locations:
 *   GET    /api/worlds                    — list worlds (paginated)
 *   POST   /api/worlds                    — create world
 *   GET    /api/worlds/:id                — get single world
 *   PUT    /api/worlds/:id                — update world
 *   DELETE /api/worlds/:id                — delete world
 *   GET    /api/worlds/:worldId/locations              — list locations
 *   POST   /api/worlds/:worldId/locations              — create location
 *   GET    /api/worlds/:worldId/locations/:locId       — get location
 *   PUT    /api/worlds/:worldId/locations/:locId       — update location
 *   DELETE /api/worlds/:worldId/locations/:locId       — delete location
 *   POST   /api/worlds/:worldId/initialize-states      — initialize location & NPC states
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { DifficultyReroll, DifficultyState, } from "../db/enums-story";
import type { DB, } from "../db/schema";
import { WorldStateService, } from "../story/world-state";
import { safeJsonStringify, uid, } from "../utils";
import { notFound, unauthorized, } from "../validation/middleware";
import { WorldCreateBody, WorldUpdateBody, } from "../validation/schemas";
import {
  ErrorCode,
  extractAuth,
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonNoContent,
  jsonPaginated,
  jsonResponse,
} from "./http-utils";

interface HandleOpts {
  database: Kysely<DB>;
  config: Config;
}

// ── Helpers ─────────────────────────────────────────────────

/** Check world access; returns error Response if denied, null if OK. */
async function requireWorldAccess(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
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

// ── Handlers ────────────────────────────────────────────────

async function handleListWorlds(database: Kysely<DB>, page: number, pageSize: number, userId: string | null,) {
  const offset = (page - 1) * pageSize;
  let countQuery = database.selectFrom("worlds",).select(database.fn.countAll<number>().as("total",),);
  let listQuery = database.selectFrom("worlds",).selectAll();

  if (userId) {
    countQuery = countQuery.where("owner_id", "=", userId,);
    listQuery = listQuery.where("owner_id", "=", userId,);
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;
  const worlds = await listQuery.orderBy("name", "asc",).limit(pageSize,).offset(offset,).execute();
  return jsonPaginated({ data: worlds, total, page, pageSize, },);
}

async function handleCreateWorld(database: Kysely<DB>, body: Record<string, unknown>, userId: string | null,) {
  if (!userId) { return unauthorized(); }

  const name = body.name as string | undefined;
  if (!name) { return jsonError({ message: "name is required", status: HttpStatus.BadRequest, },); }

  const id = uid();
  await database
    .insertInto("worlds",)
    .values({
      id,
      owner_id: userId,
      name,
      description: (body.description as string | undefined) ?? null,
      lore: (body.lore as string | undefined) ?? null,
      scan_depth: 100,
      token_budget: 2000,
      difficulty_modifier: 1,
      difficulty_reroll: DifficultyReroll.None,
      difficulty_state: DifficultyState.Normal,
    },)
    .execute();

  return jsonCreated({ id, },);
}

async function handleGetWorld(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }
  const world = await database.selectFrom("worlds",).selectAll().where("id", "=", worldId,).executeTakeFirst();
  return jsonResponse(world,);
}

async function handleUpdateWorld(
  database: Kysely<DB>,
  worldId: string,
  body: Record<string, unknown>,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const updates: Record<string, unknown> = {};
  if (body.name != null) { updates.name = body.name; }
  if (body.description != null) { updates.description = body.description; }
  if (body.lore != null) { updates.lore = body.lore; }
  if (body.scanDepth != null) { updates.scan_depth = body.scanDepth; }
  if (body.tokenBudget != null) { updates.token_budget = body.tokenBudget; }
  if (body.difficultyModifier != null) { updates.difficulty_modifier = body.difficultyModifier; }
  if (body.difficultyReroll != null) { updates.difficulty_reroll = body.difficultyReroll; }
  if (body.difficultyState != null) { updates.difficulty_state = body.difficultyState; }
  updates.updated_at = new Date().toISOString();

  await database.updateTable("worlds",).set(updates,).where("id", "=", worldId,).execute();
  return jsonResponse({ ok: true, },);
}

async function handleDeleteWorld(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const locationIds = await database
    .selectFrom("locations",)
    .select("id",)
    .where("world_id", "=", worldId,)
    .execute();
  const locIds = locationIds.map((l,) => l.id);
  if (locIds.length > 0) {
    await database.deleteFrom("location_states",).where("location_id", "in", locIds,).execute();
  }

  await database.deleteFrom("npc_states",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("world_states",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("world_lore_entries",).where("world_id", "=", worldId,).execute();

  const questIds = await database.selectFrom("quests",).select("id",).where("world_id", "=", worldId,).execute();
  const qIds = questIds.map((q,) => q.id);
  if (qIds.length > 0) { await database.deleteFrom("quest_progress",).where("quest_id", "in", qIds,).execute(); }

  await database.deleteFrom("quests",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("world_items",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("items",).where("world_id", "=", worldId,).execute();
  await database
    .deleteFrom("asset_links",)
    .where("entity_type", "=", "world",)
    .where("entity_id", "=", worldId,)
    .execute();
  await database.deleteFrom("locations",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("worlds",).where("id", "=", worldId,).execute();
  return jsonNoContent();
}

async function handleInitializeStates(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const state = new WorldStateService(database,);
  const locationsCreated = await state.initializeLocationStates(worldId,);
  const npcsCreated = await state.initializeNpcStates(worldId,);

  return jsonResponse({ ok: true, locations_initialized: locationsCreated, npcs_initialized: npcsCreated, },);
}

// ── Location handlers ─────────────────────────────────────────

async function handleListLocations(
  database: Kysely<DB>,
  worldId: string,
  page: number,
  pageSize: number,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const offset = (page - 1) * pageSize;
  const countResult = await database
    .selectFrom("locations",)
    .select(database.fn.countAll<number>().as("total",),)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();
  const total = countResult?.total ?? 0;

  const locations = await database
    .selectFrom("locations",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .orderBy("name", "asc",)
    .limit(pageSize,)
    .offset(offset,)
    .execute();

  return jsonPaginated({ data: locations, total, page, pageSize, },);
}

async function validateConnections(
  database: Kysely<DB>,
  worldId: string,
  connections: unknown,
  excludeLocationId?: string,
): Promise<Response | null> {
  if (!Array.isArray(connections,)) { return null; }

  const connIds = connections.filter((id,): id is string => typeof id === "string");
  if (connIds.length === 0) { return null; }

  const existing = await database
    .selectFrom("locations",)
    .select("id",)
    .where("world_id", "=", worldId,)
    .where("id", "in", connIds,)
    .execute();
  const existingIds = new Set(existing.map((l,) => l.id),);

  const missing = connIds.filter((id,) => !existingIds.has(id,));
  if (missing.length > 0) {
    return jsonError({
      message: `Invalid connection locations: ${missing.join(", ",)}`,
      status: HttpStatus.BadRequest,
      code: ErrorCode.ValidationError,
    },);
  }

  if (excludeLocationId && connIds.includes(excludeLocationId,)) {
    return jsonError({
      message: "Location cannot connect to itself",
      status: HttpStatus.BadRequest,
      code: ErrorCode.ValidationError,
    },);
  }

  return null;
}

async function handleCreateLocation(
  database: Kysely<DB>,
  worldId: string,
  body: Record<string, unknown>,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const name = body.name as string | undefined;
  if (!name) { return jsonError({ message: "name is required", status: HttpStatus.BadRequest, },); }

  if (body.connections) {
    const connError = await validateConnections(database, worldId, body.connections,);
    if (connError) { return connError; }
  }

  const id = uid();
  await database
    .insertInto("locations",)
    .values({
      id,
      world_id: worldId,
      name,
      description: (body.description as string | undefined) ?? null,
      parent_location_id: (body.parentLocationId as string | undefined) ?? null,
      connections: body.connections
        ? (() => {
          const r = safeJsonStringify(body.connections,);
          return r.ok ? r.value : "[]";
        })()
        : "[]",
    },)
    .execute();

  return jsonCreated({ id, },);
}

async function handleGetLocation(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const location = await database
    .selectFrom("locations",)
    .selectAll()
    .where("id", "=", locId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();

  if (!location) { return notFound("Location not found",); }
  return jsonResponse(location,);
}

async function handleUpdateLocation(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  body: Record<string, unknown>,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const updates: Record<string, unknown> = {};
  if (body.name) { updates.name = body.name; }
  if (body.description) { updates.description = body.description; }
  if (body.parentLocationId) { updates.parent_location_id = body.parentLocationId; }
  if (body.connections) {
    const connError = await validateConnections(database, worldId, body.connections, locId,);
    if (connError) { return connError; }

    const connectionsResult = safeJsonStringify(body.connections,);
    if (!connectionsResult.ok) {
      return jsonError({ message: "Invalid connections data", status: HttpStatus.BadRequest, },);
    }
    updates.connections = connectionsResult.value;
  }
  updates.updated_at = new Date().toISOString();

  await database
    .updateTable("locations",)
    .set(updates,)
    .where("id", "=", locId,)
    .where("world_id", "=", worldId,)
    .execute();
  return jsonResponse({ ok: true, },);
}

async function handleDeleteLocation(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  await database.deleteFrom("locations",).where("id", "=", locId,).where("world_id", "=", worldId,).execute();
  return jsonNoContent();
}

// ── Elysia plugin ───────────────────────────────────────────

export function worldsRoutes({ database, }: HandleOpts,): Elysia {
  return new Elysia({ name: "worlds", },)
    .get(
      "/api/worlds",
      async (ctx: any,) => {
        const { userId, } = extractAuth(ctx,);
        const page = Number(ctx.query?.page,) || 1;
        const pageSize = Number(ctx.query?.pageSize,) || 20;
        return handleListWorlds(database, page, pageSize, userId,);
      },
      {
        detail: {
          summary: "List worlds",
          description: "List all worlds visible to the authenticated user.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      "/api/worlds",
      async (ctx: any,) => {
        const { userId, } = extractAuth(ctx,);
        return handleCreateWorld(database, ctx.body as Record<string, unknown>, userId,);
      },
      {
        body: WorldCreateBody,
        detail: {
          summary: "Create world",
          description: "Create a new world. Requires authentication.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      "/api/worlds/:worldId",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleGetWorld(database, ctx.params.worldId as string, userId, userRole,);
      },
      {
        detail: {
          summary: "Get world",
          description: "Get a world by ID with its locations.",
          tags: ["Worlds",],
        },
      },
    )
    .put(
      "/api/worlds/:worldId",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleUpdateWorld(
          database,
          ctx.params.worldId as string,
          ctx.body as Record<string, unknown>,
          userId,
          userRole,
        );
      },
      {
        body: WorldUpdateBody,
        detail: {
          summary: "Update world",
          description: "Update a world's properties. Owner or admin only.",
          tags: ["Worlds",],
        },
      },
    )
    .delete(
      "/api/worlds/:worldId",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleDeleteWorld(database, ctx.params.worldId as string, userId, userRole,);
      },
      {
        detail: {
          summary: "Delete world",
          description: "Delete a world and all its locations. Owner or admin only.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      "/api/worlds/:worldId/locations",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const page = Number(ctx.query?.page,) || 1;
        const pageSize = Number(ctx.query?.pageSize,) || 20;
        return handleListLocations(database, ctx.params.worldId as string, page, pageSize, userId, userRole,);
      },
      {
        detail: {
          summary: "List locations",
          description: "List locations in a world.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      "/api/worlds/:worldId/locations",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleCreateLocation(
          database,
          ctx.params.worldId as string,
          ctx.body as Record<string, unknown>,
          userId,
          userRole,
        );
      },
      {
        detail: {
          summary: "Create location",
          description: "Create a new location in a world.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      "/api/worlds/:worldId/locations/:locId",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleGetLocation(
          database,
          ctx.params.worldId as string,
          ctx.params.locId as string,
          userId,
          userRole,
        );
      },
      {
        detail: {
          summary: "Get location",
          description: "Get a location by ID.",
          tags: ["Worlds",],
        },
      },
    )
    .put(
      "/api/worlds/:worldId/locations/:locId",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleUpdateLocation(
          database,
          ctx.params.worldId as string,
          ctx.params.locId as string,
          ctx.body as Record<string, unknown>,
          userId,
          userRole,
        );
      },
      {
        detail: {
          summary: "Update location",
          description: "Update a location's properties.",
          tags: ["Worlds",],
        },
      },
    )
    .delete(
      "/api/worlds/:worldId/locations/:locId",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleDeleteLocation(
          database,
          ctx.params.worldId as string,
          ctx.params.locId as string,
          userId,
          userRole,
        );
      },
      {
        detail: {
          summary: "Delete location",
          description: "Delete a location from a world.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      "/api/worlds/:worldId/initialize-states",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleInitializeStates(database, ctx.params.worldId as string, userId, userRole,);
      },
      {
        detail: {
          summary: "Initialize world states",
          description: "Initialize default state machines for a world's locations and NPCs.",
          tags: ["Worlds",],
        },
      },
    ) as unknown as Elysia;
}
