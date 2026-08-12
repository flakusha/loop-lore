import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { notifyGmAction, } from "../../notifications/service";
import { WorldStateService, } from "../../story/world-state";
import { safeJsonStringify, } from "../../utils";
import { notFound, } from "../../validation/middleware";
import { HttpStatus, jsonCreated, jsonError, jsonPaginated, jsonResponse, } from "../http-utils";

export async function handleNpcState(
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
  if (!worldCheck || (worldCheck.owner_id !== userId && userRole !== "admin" && userRole !== "solo")) {
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
  },)
    // GM-action notification failure is non-fatal — swallow.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    .catch(() => {},);
  return jsonResponse(updated,);
}

export async function handleNpcsAtLocation(
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
  if (!worldCheck || (worldCheck.owner_id !== userId && userRole !== "admin" && userRole !== "solo")) {
    return jsonError({ message: "Location not found", status: HttpStatus.NotFound, },);
  }

  const state = new WorldStateService(database,);
  const npcs = await state.getNpcsAtLocation(locationId,);
  return jsonResponse(npcs,);
}

export async function handleLocationState(
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
  if (!locWorld || (locWorld.owner_id !== userId && userRole !== "admin" && userRole !== "solo")) {
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
    },)
      // GM-action notification failure is non-fatal — swallow.
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {},);
  }
  const updated = await state.getLocationState(locationId,);
  return jsonResponse(updated,);
}

export async function handleWorldStates(
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
  if (!worldCheck || (worldCheck.owner_id !== userId && userRole !== "admin" && userRole !== "solo")) {
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
