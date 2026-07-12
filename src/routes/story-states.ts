/**
 * Story State Routes
 *
 * Exposes WorldStateService for read access to NPC states, location states,
 * world snapshots, and NPCs-at-location queries:
 *   GET  /api/worlds/:worldId/npc-states/:actorId    — get NPC state
 *   PUT  /api/worlds/:worldId/npc-states/:actorId    — update NPC state
 *   GET  /api/worlds/:worldId/npcs-at/:locationId    — list NPCs at location
 *   GET  /api/locations/:locationId/state            — get location state
 *   PUT  /api/locations/:locationId/state            — update location state
 *   GET  /api/worlds/:worldId/states                 — list world snapshots (paginated)
 *   POST /api/worlds/:worldId/states                 — take snapshot
 */

import { registerRoute, type RouteDispatch } from "./router";
import { safeJsonStringify } from "../utils";
import {
  BAD_METHOD,
  jsonResponse,
  jsonError,
  jsonPaginated,
  jsonCreated,
  HttpStatus,
  ErrorCode,
  parseBody,
  parsePagination,
} from "./http-utils";
import { WorldStateService } from "../story/world-state";

// ── Dispatch ──────────────────────────────────────────────────

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;
  const state = new WorldStateService(database);

  // /api/worlds/:worldId/npc-states/:actorId
  const npcStateMatch = /^\/api\/worlds\/([a-f0-9-]+)\/npc-states\/([a-f0-9-]+)$/.exec(pathname);
  if (npcStateMatch) {
    const worldId = npcStateMatch[1]!;
    const actorId = npcStateMatch[2]!;
    // Verify world ownership
    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", worldId)
      .executeTakeFirst();
    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError({ message: "NPC state not found", status: HttpStatus.NotFound });
    }
    if (method === "GET") {
      const npcState = await state.getNpcState(actorId, worldId);
      if (!npcState)
        return jsonError({
          message: "NPC state not found",
          status: HttpStatus.NotFound,
          code: ErrorCode.NotFound,
        });
      return jsonResponse(npcState);
    }
    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      const updates: Record<string, unknown> = {};
      const intFields: Record<string, string> = { health: "health" };
      const strFields: Record<string, string> = { mentalState: "mental_state" };
      const jsonFields: Record<string, string> = {
        knowledge: "knowledge",
        relationships: "relationships",
        inventory: "inventory",
        schedule: "schedule",
      };

      for (const [k, col] of Object.entries(intFields)) {
        if (body[k] != null) updates[col] = body[k];
      }
      for (const [k, col] of Object.entries(strFields)) {
        if (body[k] != null) updates[col] = body[k];
      }
      for (const [k, col] of Object.entries(jsonFields)) {
        if (body[k] == null) {
          continue;
        }

        const r = safeJsonStringify(body[k]);
        if (r.ok) updates[col] = r.value;
      }
      if (body.locationId != null) updates.location_id = body.locationId;
      updates.updated_at = new Date().toISOString();

      await database
        .updateTable("npc_states")
        .set(updates)
        .where("actor_id", "=", actorId)
        .where("world_id", "=", worldId)
        .execute();

      const updated = await state.getNpcState(actorId, worldId);
      return jsonResponse(updated);
    }
    return BAD_METHOD();
  }

  // /api/worlds/:worldId/npcs-at/:locationId
  const npcsAtMatch = /^\/api\/worlds\/([a-f0-9-]+)\/npcs-at\/([a-f0-9-]+)$/.exec(pathname);
  if (npcsAtMatch) {
    const worldId = npcsAtMatch[1]!;
    const locationId = npcsAtMatch[2]!;
    // Verify world ownership
    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", worldId)
      .executeTakeFirst();
    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError({ message: "Location not found", status: HttpStatus.NotFound });
    }
    if (method === "GET") {
      const npcs = await state.getNpcsAtLocation(locationId);
      return jsonResponse(npcs);
    }
    return BAD_METHOD();
  }

  // /api/locations/:locationId/state
  const locStateMatch = /^\/api\/locations\/([a-f0-9-]+)\/state$/.exec(pathname);
  if (locStateMatch) {
    const locationId = locStateMatch[1]!;
    // Verify world ownership via location_states → worlds
    const locWorld = await database
      .selectFrom("location_states")
      .innerJoin("worlds", "worlds.id", "location_states.world_id")
      .select(["worlds.owner_id"])
      .where("location_states.location_id", "=", locationId)
      .executeTakeFirst();
    if (!locWorld || (locWorld.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError({ message: "Location not found", status: HttpStatus.NotFound });
    }
    if (method === "GET") {
      const locState = await state.getLocationState(locationId);
      if (!locState)
        return jsonError({
          message: "Location state not found",
          status: HttpStatus.NotFound,
          code: ErrorCode.NotFound,
        });
      return jsonResponse(locState);
    }
    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      const updates: Record<string, unknown> = {};
      const strFields = ["description_override", "atmosphere", "time_of_day", "weather"] as const;
      const jsonFields: Record<string, string> = {
        npcsPresent: "npcs_present",
        itemsAvailable: "items_available",
        hazards: "hazards",
      };

      for (const f of strFields) {
        if (body[f] != null) updates[f] = body[f];
      }
      for (const [k, col] of Object.entries(jsonFields)) {
        if (body[k] == null) {
          continue;
        }

        const r = safeJsonStringify(body[k]);
        if (r.ok) updates[col] = r.value;
      }
      updates.updated_at = new Date().toISOString();

      await database
        .updateTable("location_states")
        .set(updates)
        .where("location_id", "=", locationId)
        .execute();

      const updated = await state.getLocationState(locationId);
      return jsonResponse(updated);
    }
    return BAD_METHOD();
  }

  // /api/worlds/:worldId/states (collection + snapshot)
  const worldStatesMatch = /^\/api\/worlds\/([a-f0-9-]+)\/states$/.exec(pathname);
  if (worldStatesMatch) {
    const worldId = worldStatesMatch[1]!;
    // Verify world ownership
    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", worldId)
      .executeTakeFirst();
    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError({ message: "World not found", status: HttpStatus.NotFound });
    }
    if (method === "GET") {
      const { page, pageSize } = parsePagination(searchParams);
      const offset = (page - 1) * pageSize;
      const countResult = await database
        .selectFrom("world_states")
        .select(database.fn.countAll<number>().as("total"))
        .where("world_id", "=", worldId)
        .executeTakeFirst();
      const total = countResult?.total ?? 0;
      const snapshots = await database
        .selectFrom("world_states")
        .selectAll()
        .where("world_id", "=", worldId)
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset(offset)
        .execute();
      return jsonPaginated({ data: snapshots, total, page, pageSize });
    }
    if (method === "POST") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      const id = await state.snapshot(
        worldId,
        (body.turnId as string) ?? undefined,
        (body.messageId as string) ?? undefined,
        (body.description as string) ?? undefined,
      );
      return jsonCreated({ id });
    }
    return BAD_METHOD();
  }

  return null;
};

registerRoute(dispatch);
