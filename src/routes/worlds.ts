/**
 * World Routes
 *
 * CRUD for worlds + nested locations:
 *   GET    /api/worlds                    — list worlds (paginated)
 *   POST   /api/worlds                    — create world
 *   GET    /api/worlds/:id                — get single world
 *   PUT    /api/worlds/:id                — update world
 *   DELETE /api/worlds/:id                — delete world
 *   GET    /api/worlds/:id/locations              — list locations
 *   POST   /api/worlds/:id/locations              — create location
 *   GET    /api/worlds/:id/locations/:locId       — get location
 *   PUT    /api/worlds/:id/locations/:locId       — update location
 *   DELETE /api/worlds/:id/locations/:locId       — delete location
 *   POST   /api/worlds/:id/initialize-states      — initialize location & NPC states
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { uid, safeJsonStringify } from "../utils";
import { WorldStateService } from "../story/world-state";
import {
  BAD_METHOD,
  jsonResponse,
  jsonError,
  jsonPaginated,
  jsonCreated,
  jsonNoContent,
  HttpStatus,
  ErrorCode,
  parseBody,
  parsePagination,
} from "./http-utils";

interface ListWorldsOpts {
  database: Kysely<DB>;
  page: number;
  pageSize: number;
  context: RequestContext;
}
interface CreateWorldOpts {
  database: Kysely<DB>;
  body: Record<string, unknown>;
  context: RequestContext;
}
interface GetWorldOpts {
  database: Kysely<DB>;
  worldId: string;
  context: RequestContext;
}
interface UpdateWorldOpts {
  database: Kysely<DB>;
  worldId: string;
  body: Record<string, unknown>;
  context: RequestContext;
}
interface DeleteWorldOpts {
  database: Kysely<DB>;
  worldId: string;
  context: RequestContext;
}
interface ListLocationsOpts {
  database: Kysely<DB>;
  worldId: string;
  page: number;
  pageSize: number;
  context: RequestContext;
}
interface CreateLocationOpts {
  database: Kysely<DB>;
  worldId: string;
  body: Record<string, unknown>;
  context: RequestContext;
}
interface GetLocationOpts {
  database: Kysely<DB>;
  worldId: string;
  locId: string;
  context: RequestContext;
}
interface UpdateLocationOpts {
  database: Kysely<DB>;
  worldId: string;
  locId: string;
  body: Record<string, unknown>;
  context: RequestContext;
}
interface DeleteLocationOpts {
  database: Kysely<DB>;
  worldId: string;
  locId: string;
  context: RequestContext;
}

function extractIds(pathname: string): { worldId: string | null; locId: string | null } {
  const match = /^\/api\/worlds\/([a-f0-9-]+)(?:\/locations(?:\/([a-f0-9-]+))?)?$/.exec(pathname);
  return { worldId: match?.[1] ?? null, locId: match?.[2] ?? null };
}

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  // ── World routes ────────────────────────────────────────────
  const { worldId, locId } = extractIds(pathname);

  // /api/worlds/:id/locations/:locId
  if (worldId && locId && pathname.includes("/locations/")) {
    if (method === "GET") return handleGetLocation({ database, worldId, locId, context });
    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdateLocation({ database, worldId, locId, body, context });
    }
    if (method === "DELETE") return handleDeleteLocation({ database, worldId, locId, context });
    return BAD_METHOD();
  }

  // /api/worlds/:id/locations
  if (worldId && pathname.endsWith("/locations")) {
    if (method === "GET") {
      const { page, pageSize } = parsePagination(searchParams);
      return handleListLocations({ database, worldId, page, pageSize, context });
    }
    if (method === "POST") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleCreateLocation({ database, worldId, body, context });
    }
    return BAD_METHOD();
  }

  // /api/worlds/:id/initialize-states
  if (worldId && pathname.endsWith("/initialize-states")) {
    if (method === "POST") return handleInitializeStates({ database, worldId, context });
    return BAD_METHOD();
  }

  // /api/worlds/:id
  if (worldId && !pathname.includes("/locations") && !pathname.endsWith("/initialize-states")) {
    if (method === "GET") return handleGetWorld({ database, worldId, context });
    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdateWorld({ database, worldId, body, context });
    }
    if (method === "DELETE") return handleDeleteWorld({ database, worldId, context });
    return BAD_METHOD();
  }

  // /api/worlds (collection)
  if (pathname === "/api/worlds" && method === "GET") {
    const { page, pageSize } = parsePagination(searchParams);
    return handleListWorlds({ database, page, pageSize, context });
  }

  if (pathname === "/api/worlds" && method === "POST") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleCreateWorld({ database, body, context });
  }

  return null; // Not a world route
};

// ── World handlers ────────────────────────────────────────────

async function handleListWorlds({ database, page, pageSize, context }: ListWorldsOpts): Promise<Response> {
  const userId = context.userId;
  const offset = (page - 1) * pageSize;

  let countQuery = database.selectFrom("worlds").select(database.fn.countAll<number>().as("total"));
  let listQuery = database.selectFrom("worlds").selectAll();

  if (userId) {
    countQuery = countQuery.where("owner_id", "=", userId);
    listQuery = listQuery.where("owner_id", "=", userId);
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;

  const worlds = await listQuery.orderBy("name", "asc").limit(pageSize).offset(offset).execute();

  return jsonPaginated({ data: worlds, total, page, pageSize });
}

async function handleCreateWorld({ database, body, context }: CreateWorldOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const name = body.name as string | undefined;
  if (!name) return jsonError({ message: "name is required", status: HttpStatus.BadRequest });

  const id = uid();
  await database
    .insertInto("worlds")
    .values({
      id,
      owner_id: userId,
      name,
      description: (body.description as string | undefined) ?? null,
      lore: (body.lore as string | undefined) ?? null,
      scan_depth: 100,
      token_budget: 2000,
      difficulty_modifier: 1,
      difficulty_reroll: "off",
      difficulty_state: "alive",
    })
    .execute();

  return jsonCreated({ id });
}

async function handleGetWorld({ database, worldId, context }: GetWorldOpts): Promise<Response> {
  const { userId, userRole } = context;
  const world = await database.selectFrom("worlds").selectAll().where("id", "=", worldId).executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin"))
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  return jsonResponse(world);
}

async function handleUpdateWorld({ database, worldId, body, context }: UpdateWorldOpts): Promise<Response> {
  const { userId, userRole } = context;
  const world = await database
    .selectFrom("worlds")
    .select("owner_id")
    .where("id", "=", worldId)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin"))
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const updates: Record<string, unknown> = {};
  if (body.name != null) updates.name = body.name;
  if (body.description != null) updates.description = body.description;
  if (body.lore != null) updates.lore = body.lore;
  if (body.scanDepth != null) updates.scan_depth = body.scanDepth;
  if (body.tokenBudget != null) updates.token_budget = body.tokenBudget;
  if (body.difficultyModifier != null) updates.difficulty_modifier = body.difficultyModifier;
  if (body.difficultyReroll != null) updates.difficulty_reroll = body.difficultyReroll;
  if (body.difficultyState != null) updates.difficulty_state = body.difficultyState;
  updates.updated_at = new Date().toISOString();

  await database.updateTable("worlds").set(updates).where("id", "=", worldId).execute();

  return jsonResponse({ ok: true });
}

async function handleDeleteWorld({ database, worldId, context }: DeleteWorldOpts): Promise<Response> {
  const { userId, userRole } = context;
  const world = await database
    .selectFrom("worlds")
    .select("owner_id")
    .where("id", "=", worldId)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin"))
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  // Delete child tables in FK order (leaf tables first)
  // Get location IDs for location_states cleanup
  const locationIds = await database
    .selectFrom("locations")
    .select("id")
    .where("world_id", "=", worldId)
    .execute();
  const locIds = locationIds.map((l) => l.id);

  if (locIds.length > 0) {
    await database.deleteFrom("location_states").where("location_id", "in", locIds).execute();
  }

  await database.deleteFrom("npc_states").where("world_id", "=", worldId).execute();
  await database.deleteFrom("world_states").where("world_id", "=", worldId).execute();
  await database.deleteFrom("world_lore_entries").where("world_id", "=", worldId).execute();

  // Get quest IDs for quest_progress cleanup
  const questIds = await database
    .selectFrom("quests")
    .select("id")
    .where("world_id", "=", worldId)
    .execute();
  const qIds = questIds.map((q) => q.id);

  if (qIds.length > 0) {
    await database.deleteFrom("quest_progress").where("quest_id", "in", qIds).execute();
  }

  await database.deleteFrom("quests").where("world_id", "=", worldId).execute();
  await database.deleteFrom("world_items").where("world_id", "=", worldId).execute();
  await database.deleteFrom("items").where("world_id", "=", worldId).execute();
  await database
    .deleteFrom("asset_links")
    .where("entity_type", "=", "world")
    .where("entity_id", "=", worldId)
    .execute();
  await database.deleteFrom("locations").where("world_id", "=", worldId).execute();
  await database.deleteFrom("worlds").where("id", "=", worldId).execute();
  return jsonNoContent();
}

interface InitializeStatesOpts {
  database: Kysely<DB>;
  worldId: string;
  context: RequestContext;
}

/**
 * Initialize location and NPC states for a world.
 * Creates default state records for all locations and NPCs.
 */
async function handleInitializeStates({
  database,
  worldId,
  context,
}: InitializeStatesOpts): Promise<Response> {
  const { userId, userRole } = context;
  const world = await database
    .selectFrom("worlds")
    .select("owner_id")
    .where("id", "=", worldId)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin"))
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const state = new WorldStateService(database);
  const locationsCreated = await state.initializeLocationStates(worldId);
  const npcsCreated = await state.initializeNpcStates(worldId);

  return jsonResponse({
    ok: true,
    locations_initialized: locationsCreated,
    npcs_initialized: npcsCreated,
  });
}

// ── Location handlers ─────────────────────────────────────────

async function handleListLocations({
  database,
  worldId,
  page,
  pageSize,
  context,
}: ListLocationsOpts): Promise<Response> {
  const { userId, userRole } = context;
  const world = await database
    .selectFrom("worlds")
    .select("owner_id")
    .where("id", "=", worldId)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin"))
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const offset = (page - 1) * pageSize;

  const countResult = await database
    .selectFrom("locations")
    .select(database.fn.countAll<number>().as("total"))
    .where("world_id", "=", worldId)
    .executeTakeFirst();
  const total = countResult?.total ?? 0;

  const locations = await database
    .selectFrom("locations")
    .selectAll()
    .where("world_id", "=", worldId)
    .orderBy("name", "asc")
    .limit(pageSize)
    .offset(offset)
    .execute();

  return jsonPaginated({ data: locations, total, page, pageSize });
}

/**
 * Validate that all connection IDs reference existing locations in the same world.
 * Returns null if valid, or an error Response if invalid.
 */
async function validateConnections(
  database: Kysely<DB>,
  worldId: string,
  connections: unknown,
  excludeLocationId?: string,
): Promise<Response | null> {
  if (!Array.isArray(connections)) return null;

  const connIds = connections.filter((id): id is string => typeof id === "string");
  if (connIds.length === 0) return null;

  // Check all connection IDs exist in this world
  const existing = await database
    .selectFrom("locations")
    .select("id")
    .where("world_id", "=", worldId)
    .where("id", "in", connIds)
    .execute();
  const existingIds = new Set(existing.map((l) => l.id));

  const missing = connIds.filter((id) => !existingIds.has(id));
  if (missing.length > 0) {
    return jsonError({
      message: `Invalid connection locations: ${missing.join(", ")}`,
      status: HttpStatus.BadRequest,
      code: ErrorCode.ValidationError,
    });
  }

  // Check for self-connection
  if (excludeLocationId && connIds.includes(excludeLocationId)) {
    return jsonError({
      message: "Location cannot connect to itself",
      status: HttpStatus.BadRequest,
      code: ErrorCode.ValidationError,
    });
  }

  return null;
}

async function handleCreateLocation({
  database,
  worldId,
  body,
  context,
}: CreateLocationOpts): Promise<Response> {
  const { userId, userRole } = context;
  const world = await database
    .selectFrom("worlds")
    .select("owner_id")
    .where("id", "=", worldId)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin"))
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const name = body.name as string | undefined;
  if (!name) return jsonError({ message: "name is required", status: HttpStatus.BadRequest });

  // Validate connections if provided
  if (body.connections) {
    const connError = await validateConnections(database, worldId, body.connections);
    if (connError) return connError;
  }

  const id = uid();
  await database
    .insertInto("locations")
    .values({
      id,
      world_id: worldId,
      name,
      description: (body.description as string | undefined) ?? null,
      parent_location_id: (body.parentLocationId as string | undefined) ?? null,
      connections: body.connections
        ? (() => {
            const r = safeJsonStringify(body.connections);
            return r.ok ? r.value : "[]";
          })()
        : "[]",
    })
    .execute();

  return jsonCreated({ id });
}

async function handleGetLocation({ database, worldId, locId, context }: GetLocationOpts): Promise<Response> {
  const { userId, userRole } = context;
  const world = await database
    .selectFrom("worlds")
    .select("owner_id")
    .where("id", "=", worldId)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin"))
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const location = await database
    .selectFrom("locations")
    .selectAll()
    .where("id", "=", locId)
    .where("world_id", "=", worldId)
    .executeTakeFirst();

  if (!location)
    return jsonError({
      message: "Location not found",
      status: HttpStatus.NotFound,
      code: ErrorCode.NotFound,
    });
  return jsonResponse(location);
}

async function handleUpdateLocation({
  database,
  worldId,
  locId,
  body,
  context,
}: UpdateLocationOpts): Promise<Response> {
  const { userId, userRole } = context;
  const world = await database
    .selectFrom("worlds")
    .select("owner_id")
    .where("id", "=", worldId)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin"))
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  const updates: Record<string, unknown> = {};
  if (body.name) updates.name = body.name;
  if (body.description) updates.description = body.description;
  if (body.parentLocationId) updates.parent_location_id = body.parentLocationId;
  if (body.connections) {
    // Validate connection IDs exist in this world
    const connError = await validateConnections(database, worldId, body.connections, locId);
    if (connError) return connError;

    const connectionsResult = safeJsonStringify(body.connections);
    if (!connectionsResult.ok)
      return jsonError({ message: "Invalid connections data", status: HttpStatus.BadRequest });
    updates.connections = connectionsResult.value;
  }
  updates.updated_at = new Date().toISOString();

  await database
    .updateTable("locations")
    .set(updates)
    .where("id", "=", locId)
    .where("world_id", "=", worldId)
    .execute();

  return jsonResponse({ ok: true });
}

async function handleDeleteLocation({
  database,
  worldId,
  locId,
  context,
}: DeleteLocationOpts): Promise<Response> {
  const { userId, userRole } = context;
  const world = await database
    .selectFrom("worlds")
    .select("owner_id")
    .where("id", "=", worldId)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin"))
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  await database.deleteFrom("locations").where("id", "=", locId).where("world_id", "=", worldId).execute();

  return jsonNoContent();
}

registerRoute(dispatch);
export { dispatch };
