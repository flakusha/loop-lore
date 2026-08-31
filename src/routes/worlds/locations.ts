// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { PublicationStatus, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
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
import { createLocationChat, resolveLocationTemplate, } from "./location-chat";

/**
 * @param database
 * @param worldId
 * @param page
 * @param pageSize
 * @param userId
 * @param userRole
 */
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

/**
 * @param database
 * @param worldId
 * @param connections
 * @param excludeLocationId
 */
export async function validateConnections(
  database: Kysely<DB>,
  worldId: string,
  connections: unknown,
  excludeLocationId?: string,
): Promise<Response | null> {
  if (!Array.isArray(connections,)) { return null; }

  const connIds: string[] = [];
  for (const id of connections) {
    if (typeof id === "string") { connIds.push(id,); }
  }
  if (connIds.length === 0) { return null; }

  const existing = await database
    .selectFrom("locations",)
    .select("id",)
    .where("world_id", "=", worldId,)
    .where("id", "in", connIds,)
    .execute();
  const existingIds = new Set(Array.from(existing, (l,) => l.id,),);

  const missing: string[] = [];
  for (const id of connIds) {
    if (!existingIds.has(id,)) { missing.push(id,); }
  }
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

/**
 * @param database
 * @param worldId
 * @param body
 * @param userId
 * @param userRole
 */
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

  // Resolve the template BEFORE opening the transaction — bun:sqlite is
  // single-connection, so a query on `database` inside the tx would deadlock.
  const template = await resolveLocationTemplate(database, body,);
  if (!template) {
    return jsonError({ message: "Chat setup template not found", status: HttpStatus.BadRequest, },);
  }

  try {
    await database.transaction().execute(async (tx,) => {
      await tx
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

      await createLocationChat(tx, {
        locationId: id,
        worldId,
        name,
        body,
        fallbackUserId: userId,
      }, template,);
    },);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error,),);
    getLogger().error(
      "Location creation failed",
      failure,
      { worldId, locationId: id, },
    );
    return jsonError({
      message: "Failed to create location with its public chat",
      status: HttpStatus.InternalServerError,
    },);
  }

  return jsonCreated({ id, },);
}

/**
 * @param database
 * @param worldId
 * @param locId
 * @param userId
 * @param userRole
 */
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

/**
 * @param database
 * @param worldId
 * @param locId
 * @param body
 * @param userId
 * @param userRole
 */
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

/**
 * @param database
 * @param worldId
 * @param locId
 * @param userId
 * @param userRole
 */
export async function handleDeleteLocation(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  // Unlink any chats bound to this location (auto-created public chat) — the
  // chats survive but are no longer location-bound (chats.current_location_id
  // and .world_id are nullable FK columns; no ON DELETE CASCADE exists).
  await database
    .updateTable("chats",)
    .set({ current_location_id: null, },)
    .where("current_location_id", "=", locId,)
    .execute();

  await database.deleteFrom("locations",).where("id", "=", locId,).where("world_id", "=", worldId,).execute();
  return jsonNoContent();
}
