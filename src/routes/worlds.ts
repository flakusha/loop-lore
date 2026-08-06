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

import { Elysia, t, } from "elysia";
import { type ExpressionBuilder, type Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { DifficultyReroll, DifficultyState, PublicationStatus, WorldKind, WorldVisibility, } from "../db/enums-story";
import type { DB, } from "../db/schema";
import { WorldStateService, } from "../story/world-state";
import { safeJsonStringify, uid, } from "../utils";
import { forbidden, notFound, unauthorized, } from "../validation/middleware";
import { ErrorResponse, SuccessResponse, WorldCreateBody, WorldUpdateBody, } from "../validation/schemas";
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

/** Check world access; returns error Response if denied, null if OK.
 *
 * Single-server model (no federation, no per-channel ACLs): access is
 * owner | admin | world member | (public AND authenticated). SFW/NSFW gating
 * is orthogonal and handled by the existing canAccessNsfw chain. */
async function requireWorldAccess(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
): Promise<Response | null> {
  const world = await database
    .selectFrom("worlds",)
    .select(["owner_id", "visibility",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!world) { return notFound("World not found",); }
  if (world.owner_id === userId || userRole === "admin") { return null; }
  if (!userId) { return notFound("World not found",); }
  // Public worlds are readable by any authenticated user.
  if (world.visibility === WorldVisibility.Public) { return null; }
  // Unlisted/private worlds: owner + world members (joined via invite) only.
  const member = await database
    .selectFrom("world_members",)
    .select("actor_id",)
    .where("world_id", "=", worldId,)
    .where("actor_id", "=", userId,)
    .executeTakeFirst();
  if (member) { return null; }
  return notFound("World not found",);
}

/**
 * Check the caller OWNS the world (or is admin/solo) — for MUTATIONS.
 * Read access (public/member) is governed by requireWorldAccess.
 * @returns error Response if denied, null if OK.
 */
async function requireWorldOwner(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
): Promise<Response | null> {
  const world = await database
    .selectFrom("worlds",)
    .select(["owner_id",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!world) { return notFound("World not found",); }
  if (world.owner_id === userId || userRole === "admin" || userRole === "solo") { return null; }
  return forbidden("Forbidden",);
}

// ── Handlers ────────────────────────────────────────────────

async function handleListWorlds(database: Kysely<DB>, page: number, pageSize: number, userId: string | null,) {
  const offset = (page - 1) * pageSize;

  // Worlds visible to the user: owned, public, or joined (world member).
  const memberWorldIds: string[] = [];
  if (userId) {
    const rows = await database
      .selectFrom("world_members",)
      .select("world_id",)
      .where("actor_id", "=", userId,)
      .execute();
    for (const row of rows) {
      memberWorldIds.push(row.world_id,);
    }
  }

  let countQuery = database.selectFrom("worlds",).select(database.fn.countAll<number>().as("total",),);
  let listQuery = database.selectFrom("worlds",).selectAll();

  if (userId) {
    const visible = (eb: ExpressionBuilder<DB, "worlds">,) =>
      eb.or([
        eb("owner_id", "=", userId,),
        eb("visibility", "=", WorldVisibility.Public,),
        ...(memberWorldIds.length > 0 ? [eb("id", "in", memberWorldIds,),] : []),
      ],);
    countQuery = countQuery.where(visible,);
    listQuery = listQuery.where(visible,);
  } else {
    countQuery = countQuery.where("visibility", "=", WorldVisibility.Public,);
    listQuery = listQuery.where("visibility", "=", WorldVisibility.Public,);
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
      publication_status: PublicationStatus.Draft,
      kind: (body.kind as WorldKind | undefined) ?? WorldKind.Rpg,
      visibility: (body.visibility as WorldVisibility | undefined) ?? WorldVisibility.Private,
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
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
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
  if (body.kind != null) { updates.kind = body.kind; }
  if (body.visibility != null) { updates.visibility = body.visibility; }
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
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
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
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
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
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
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
      publication_status: PublicationStatus.Draft,
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
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
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
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  await database.deleteFrom("locations",).where("id", "=", locId,).where("world_id", "=", worldId,).execute();
  return jsonNoContent();
}

/**
 * List chats in a world the user participates in, optionally filtered by
 * location — the grouped enumeration that powers the world channel tree.
 * In a chat-only world, `chats.current_location_id` is the static channel
 * binding; the frontend groups the returned rows by location.
 */
async function handleListWorldChats(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
  locationId: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }
  if (!userId) { return unauthorized(); }

  let query = database
    .selectFrom("chats",)
    .leftJoin("locations", "locations.id", "chats.current_location_id",)
    .select([
      "chats.id",
      "chats.name",
      "chats.current_location_id",
      "chats.updated_at",
      "locations.name as location_name",
    ],)
    .where("chats.world_id", "=", worldId,)
    .where("chats.is_pinned", "!=", "archived",)
    .where(
      "chats.id",
      "in",
      database
        .selectFrom("chat_participants",)
        .select("chat_id",)
        .where("actor_id", "=", userId,),
    );

  if (locationId) {
    query = query.where("chats.current_location_id", "=", locationId,);
  }

  const chats = await query.orderBy("chats.updated_at", "desc",).execute();
  return jsonResponse({ data: chats, },);
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
        response: {
          200: t.Object({ data: t.Array(t.Any(),), total: t.Number(), page: t.Number(), pageSize: t.Number(), },),
          401: ErrorResponse,
        },
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
        response: {
          201: t.Object({ id: t.String(), },),
          401: ErrorResponse,
        },
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
        response: {
          200: t.Any(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
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
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
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
        response: {
          204: t.Void(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
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
        response: {
          200: t.Object({ data: t.Array(t.Any(),), total: t.Number(), page: t.Number(), pageSize: t.Number(), },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
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
        response: {
          201: t.Object({ id: t.String(), },),
          400: ErrorResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
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
        response: {
          200: t.Any(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
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
        response: {
          200: SuccessResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
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
        response: {
          204: t.Void(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Delete location",
          description: "Delete a location from a world.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      "/api/worlds/:worldId/chats",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const locationId = (ctx.query?.locationId as string | undefined) ?? null;
        return handleListWorldChats(database, ctx.params.worldId as string, userId, userRole, locationId,);
      },
      {
        params: t.Object({ worldId: t.String(), },),
        query: t.Optional(t.Object({ locationId: t.Optional(t.String(),), },),),
        response: {
          200: t.Object({ data: t.Array(t.Any(),), },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "List world chats",
          description:
            "List chats in a world the user participates in, optionally filtered by location (world channel tree).",
          tags: ["Worlds", "Chats",],
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
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Initialize world states",
          description: "Initialize default state machines for a world's locations and NPCs.",
          tags: ["Worlds",],
        },
      },
    ) as unknown as Elysia;
}
