import type { Kysely, } from "kysely";
import { PublicationStatus, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, uid, } from "../../utils";
import { notFound, } from "../../validation/middleware";
import {
  ErrorCode,
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonNoContent,
  jsonPaginated,
  jsonResponse,
} from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";

export async function handleListLocations(
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

export async function validateConnections(
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

export async function handleCreateLocation(
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

export async function handleGetLocation(
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

export async function handleUpdateLocation(
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

export async function handleDeleteLocation(
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
